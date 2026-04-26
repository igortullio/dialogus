import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type DownloadStageDeps, downloadStage } from '../../../src/application/stages/download'
import { DownloadError } from '../../../src/domain/ingestion/IngestionError'
import type { GutendexDownloader } from '../../../src/infrastructure/external/GutendexDownloader'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234

interface UpdateCall {
  set: Record<string, unknown>
  whereId: string
}

interface MockDbResult {
  db: Database
  bookRow: BookRecordForStage
  setBook(next: BookRecordForStage | null): void
  updates: UpdateCall[]
  findFirstCalls: number
}

function makeMockDb(initial: BookRecordForStage | null): MockDbResult {
  let current = initial
  const updates: UpdateCall[] = []
  let findFirstCalls = 0
  const findFirst = vi.fn(async () => {
    findFirstCalls += 1
    return current ?? undefined
  })
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's update chain shape
  const updateChain: any = {
    set(value: Record<string, unknown>) {
      this._set = value
      return this
    },
    where(_cond: unknown) {
      updates.push({ set: this._set as Record<string, unknown>, whereId: BOOK_ID })
      return Promise.resolve()
    },
  }
  const db = {
    query: { books: { findFirst } },
    update: vi.fn(() => updateChain),
  } as unknown as Database
  return {
    db,
    get bookRow() {
      if (!current) throw new Error('book row cleared')
      return current
    },
    setBook(next) {
      current = next
    },
    updates,
    get findFirstCalls() {
      return findFirstCalls
    },
  } as MockDbResult
}

function makeBook(overrides: Partial<BookRecordForStage> = {}): BookRecordForStage {
  return {
    id: BOOK_ID,
    gutendexId: GUTENDEX_ID,
    ingestionStatus: 'discovered',
    ingestionLastStage: null,
    ingestionStartedAt: null,
    rawHash: null,
    downloadUrlEpub: 'https://example.test/epub',
    downloadUrlTxt: 'https://example.test/txt',
    ...overrides,
  }
}

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
  msg: string
}

function makeLogger(): { logger: DownloadStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: DownloadStageDeps['logger'] = {
    info(meta, msg) {
      logs.push({ level: 'info', meta, msg })
    },
    warn(meta, msg) {
      logs.push({ level: 'warn', meta, msg })
    },
    error(meta, msg) {
      logs.push({ level: 'error', meta, msg })
    },
  }
  return { logger, logs }
}

function makeDownloader(
  overrides: Partial<GutendexDownloader> = {},
): GutendexDownloader & { download: ReturnType<typeof vi.fn> } {
  const download = vi.fn(async (gutendexId: number, format: 'epub' | 'txt') => ({
    path: `./tmp/raw/${gutendexId}.${format}`,
    sha256: 'sha-from-real-download',
    bytes: 42,
  }))
  return { download, ...overrides } as unknown as GutendexDownloader & {
    download: ReturnType<typeof vi.fn>
  }
}

function makePgBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'job-id-123')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

let workdir: string

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'download-stage-'))
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

async function placeRawFile(format: 'epub' | 'txt', body: string | Buffer): Promise<string> {
  const dir = join(workdir, 'raw')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${GUTENDEX_ID}.${format}`)
  await writeFile(path, body)
  return path
}

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

describe('downloadStage — happy path', () => {
  it('marks the book as downloading, downloads, persists raw_hash, and enqueues clean', async () => {
    const book = makeBook()
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()

    await downloadStage(
      { bookId: BOOK_ID },
      { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
    )

    expect(mock.findFirstCalls).toBe(1)
    expect(downloader.download).toHaveBeenCalledTimes(1)
    expect(downloader.download).toHaveBeenCalledWith(GUTENDEX_ID, 'epub')

    const downloadingUpdate = mock.updates[0]?.set
    expect(downloadingUpdate?.ingestionStatus).toBe('downloading')
    expect(downloadingUpdate?.ingestionProgress).toBe(0)
    expect(downloadingUpdate?.ingestionLastStage).toBe('download')
    expect(downloadingUpdate?.ingestionError).toBeNull()
    expect(downloadingUpdate?.ingestionStartedAt).toBeDefined()

    const rawHashUpdate = mock.updates[1]?.set
    expect(rawHashUpdate?.rawHash).toBe('sha-from-real-download')
    expect(rawHashUpdate?.ingestionProgress).toBe(100)

    expect(pgboss.send).toHaveBeenCalledWith('ingestion.clean', { bookId: BOOK_ID })

    expect(logs.find((l) => l.level === 'info')?.meta).toMatchObject({
      stage: 'download',
      book_id: BOOK_ID,
      cache_hit: false,
      duration_ms: expect.any(Number),
    })
  })

  it('falls back to txt when only the txt URL is available', async () => {
    const book = makeBook({ downloadUrlEpub: null, downloadUrlTxt: 'https://example.test/txt' })
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger } = makeLogger()

    await downloadStage(
      { bookId: BOOK_ID },
      { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
    )

    expect(downloader.download).toHaveBeenCalledWith(GUTENDEX_ID, 'txt')
  })
})

describe('downloadStage — SHA-256 idempotency check', () => {
  it('skips re-download when an existing raw file matches the stored hash', async () => {
    const body = Buffer.from('existing-raw-content')
    const expectedHash = sha256(body)
    await placeRawFile('epub', body)

    const book = makeBook({ rawHash: expectedHash })
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()

    await downloadStage(
      { bookId: BOOK_ID },
      { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
    )

    expect(downloader.download).not.toHaveBeenCalled()
    expect(pgboss.send).toHaveBeenCalledWith('ingestion.clean', { bookId: BOOK_ID })

    const logEntry = logs.find((l) => l.level === 'info')
    expect(logEntry?.meta.cache_hit).toBe(true)

    const completedUpdate = mock.updates[1]?.set
    expect(completedUpdate?.ingestionProgress).toBe(100)
    expect(completedUpdate?.rawHash).toBeUndefined()
  })

  it('re-downloads when the existing raw file hash does not match the stored hash', async () => {
    await placeRawFile('epub', 'tampered-content')
    const book = makeBook({ rawHash: sha256('original-content') })
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger } = makeLogger()

    await downloadStage(
      { bookId: BOOK_ID },
      { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
    )

    expect(downloader.download).toHaveBeenCalledTimes(1)
    const rawHashUpdate = mock.updates[1]?.set
    expect(rawHashUpdate?.rawHash).toBe('sha-from-real-download')
  })

  it('downloads when the file is missing even if rawHash is present', async () => {
    const book = makeBook({ rawHash: 'stored-hash' })
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger } = makeLogger()

    await downloadStage(
      { bookId: BOOK_ID },
      { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
    )

    expect(downloader.download).toHaveBeenCalledTimes(1)
  })
})

describe('downloadStage — failure handling', () => {
  it('marks the book failed with the download slug and rethrows the DownloadError', async () => {
    const book = makeBook()
    const mock = makeMockDb(book)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()
    downloader.download.mockRejectedValueOnce(new DownloadError('Gutenberg responded 503'))

    await expect(
      downloadStage(
        { bookId: BOOK_ID },
        { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
      ),
    ).rejects.toThrow(DownloadError)

    const failedUpdate = mock.updates.at(-1)?.set
    expect(failedUpdate?.ingestionStatus).toBe('failed')
    expect(failedUpdate?.ingestionError).toContain('ingestion-download-failed')
    expect(failedUpdate?.ingestionError).toContain('Gutenberg responded 503')

    expect(pgboss.send).not.toHaveBeenCalled()

    const errorLog = logs.find((l) => l.level === 'error')
    expect(errorLog?.meta).toMatchObject({
      stage: 'download',
      book_id: BOOK_ID,
      error_slug: 'ingestion-download-failed',
      retryable: true,
    })
  })

  it('throws when the book is not found', async () => {
    const mock = makeMockDb(null)
    const downloader = makeDownloader()
    const pgboss = makePgBoss()
    const { logger } = makeLogger()

    await expect(
      downloadStage(
        { bookId: BOOK_ID },
        { db: mock.db, logger, downloader, pgboss, storageRoot: workdir },
      ),
    ).rejects.toThrow(/not found/)
  })
})
