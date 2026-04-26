import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@dialogus/db/client'
import type { PgBoss } from '@dialogus/db/pgboss'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookRecordForStage } from '../../../src/application/stages/_common'
import { type CleanStageDeps, cleanStage } from '../../../src/application/stages/clean'

const BOOK_ID = 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1'
const GUTENDEX_ID = 1234

interface UpdateCall {
  set: Record<string, unknown>
}

function makeMockDb(initial: BookRecordForStage | null) {
  const current = initial
  const updates: UpdateCall[] = []
  const findFirst = vi.fn(async () => current ?? undefined)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's update chain shape
  const updateChain: any = {
    set(value: Record<string, unknown>) {
      this._set = value
      return this
    },
    where(_cond: unknown) {
      updates.push({ set: this._set as Record<string, unknown> })
      return Promise.resolve()
    },
  }
  const db = {
    query: { books: { findFirst } },
    update: vi.fn(() => updateChain),
  } as unknown as Database
  return { db, updates }
}

function makeBook(overrides: Partial<BookRecordForStage> = {}): BookRecordForStage {
  return {
    id: BOOK_ID,
    gutendexId: GUTENDEX_ID,
    languages: ['en'],
    ingestionStatus: 'downloading',
    ingestionLastStage: 'download',
    ingestionStartedAt: new Date('2026-04-26T10:00:00Z'),
    rawHash: 'some-hash',
    downloadUrlEpub: null,
    downloadUrlTxt: 'https://example.test/txt',
    ...overrides,
  }
}

interface CapturedLog {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
  msg: string
}

function makeLogger(): { logger: CleanStageDeps['logger']; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  const logger: CleanStageDeps['logger'] = {
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

function makePgBoss(): PgBoss & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => 'job-id-456')
  return { send } as unknown as PgBoss & { send: ReturnType<typeof vi.fn> }
}

let workdir: string

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'clean-stage-'))
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

async function placeRaw(format: 'txt' | 'epub', content: string): Promise<string> {
  const dir = join(workdir, 'raw')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${GUTENDEX_ID}.${format}`)
  await writeFile(path, content, 'utf8')
  return path
}

async function placeClean(content: string): Promise<string> {
  const dir = join(workdir, 'clean')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${GUTENDEX_ID}.txt`)
  await writeFile(path, content, 'utf8')
  return path
}

const RAW_TXT_FIXTURE = [
  'License preamble that should be stripped.',
  '',
  '*** START OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***',
  '',
  'Chapter I',
  '',
  'It was the best of times, it was the worst of times.',
  '',
  '*** END OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***',
  '',
  'License tail that should also be stripped.',
].join('\n')

describe('cleanStage — happy path', () => {
  it('reads the raw txt, writes the cleaned text, and enqueues parse', async () => {
    await placeRaw('txt', RAW_TXT_FIXTURE)
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()

    await cleanStage({ bookId: BOOK_ID }, { db, logger, pgboss, storageRoot: workdir })

    const cleanPath = join(workdir, 'clean', `${GUTENDEX_ID}.txt`)
    const cleanedContent = await readFile(cleanPath, 'utf8')
    expect(cleanedContent).not.toContain('License preamble')
    expect(cleanedContent).not.toContain('License tail')
    expect(cleanedContent).toContain('Chapter I')

    expect(updates[0]?.set.ingestionStatus).toBe('cleaning')
    expect(updates[0]?.set.ingestionProgress).toBe(0)
    expect(updates[0]?.set.ingestionLastStage).toBe('clean')
    expect(updates[0]?.set.ingestionError).toBeNull()
    expect(updates.at(-1)?.set.ingestionProgress).toBe(100)

    expect(pgboss.send).toHaveBeenCalledWith('ingestion.parse', { bookId: BOOK_ID })

    const infoLog = logs.find((l) => l.level === 'info')
    expect(infoLog?.meta).toMatchObject({
      stage: 'clean',
      book_id: BOOK_ID,
      cache_hit: false,
      duration_ms: expect.any(Number),
    })
  })
})

describe('cleanStage — idempotency', () => {
  it('does not read raw or rewrite clean when the cleaned file already exists', async () => {
    const preCleaned = 'previously-cleaned-content'
    await placeClean(preCleaned)
    // Intentionally do not place a raw file — handler must short-circuit.

    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()

    await cleanStage({ bookId: BOOK_ID }, { db, logger, pgboss, storageRoot: workdir })

    const stillThere = await readFile(join(workdir, 'clean', `${GUTENDEX_ID}.txt`), 'utf8')
    expect(stillThere).toBe(preCleaned)

    expect(pgboss.send).toHaveBeenCalledWith('ingestion.parse', { bookId: BOOK_ID })
    expect(updates.at(-1)?.set.ingestionProgress).toBe(100)
    expect(logs.find((l) => l.level === 'info')?.meta.cache_hit).toBe(true)
  })
})

describe('cleanStage — failure handling', () => {
  it('marks the book failed with the clean slug when the raw file is missing', async () => {
    const book = makeBook()
    const { db, updates } = makeMockDb(book)
    const pgboss = makePgBoss()
    const { logger, logs } = makeLogger()

    await expect(
      cleanStage({ bookId: BOOK_ID }, { db, logger, pgboss, storageRoot: workdir }),
    ).rejects.toThrow()

    expect(pgboss.send).not.toHaveBeenCalled()
    const failedUpdate = updates.at(-1)?.set
    expect(failedUpdate?.ingestionStatus).toBe('failed')
    expect(failedUpdate?.ingestionError).toContain('ingestion-clean-failed')

    expect(logs.find((l) => l.level === 'error')?.meta).toMatchObject({
      stage: 'clean',
      book_id: BOOK_ID,
      error_slug: 'ingestion-clean-failed',
    })
  })
})
