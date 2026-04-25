import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BASE_URL,
  epubUrl,
  FIXTURE_BOOK_ID,
  happyPathHandlers,
  MISSING_BOOK_ID,
  SAMPLE_EPUB_PATH,
  SAMPLE_TXT_PATH,
} from '../../../__fixtures__/gutenberg/handlers'
import { DownloadError } from '../../../src/domain/ingestion/IngestionError'
import { GutendexDownloader } from '../../../src/infrastructure/external/GutendexDownloader'

const server = setupServer(...happyPathHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers(...happyPathHandlers))
afterAll(() => server.close())

let workdir: string

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'gutendex-downloader-'))
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

function makeDownloader(overrides: ConstructorParameters<typeof GutendexDownloader>[0] = {}) {
  return new GutendexDownloader({
    baseUrl: BASE_URL,
    storageDir: join(workdir, 'raw'),
    limiterOptions: { maxConcurrent: 1, minTime: 0 },
    retryBaseDelayMs: 1,
    maxJitterMs: 0,
    ...overrides,
  })
}

async function expectedSha256(path: string): Promise<{ sha256: string; bytes: number }> {
  const buf = await readFile(path)
  return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }
}

describe('GutendexDownloader.download — happy path', () => {
  it('returns { path, sha256, bytes } matching the EPUB fixture', async () => {
    const downloader = makeDownloader()
    const expected = await expectedSha256(SAMPLE_EPUB_PATH)

    const result = await downloader.download(FIXTURE_BOOK_ID, 'epub')

    expect(result.path).toBe(join(workdir, 'raw', `${FIXTURE_BOOK_ID}.epub`))
    expect(result.sha256).toBe(expected.sha256)
    expect(result.bytes).toBe(expected.bytes)
    const written = await readFile(result.path)
    expect(written.equals(await readFile(SAMPLE_EPUB_PATH))).toBe(true)
  })

  it('returns { path, sha256, bytes } matching the TXT fixture', async () => {
    const downloader = makeDownloader()
    const expected = await expectedSha256(SAMPLE_TXT_PATH)

    const result = await downloader.download(FIXTURE_BOOK_ID, 'txt')

    expect(result.path).toBe(join(workdir, 'raw', `${FIXTURE_BOOK_ID}.txt`))
    expect(result.sha256).toBe(expected.sha256)
    expect(result.bytes).toBe(expected.bytes)
  })

  it('writes the file to the configured storage directory', async () => {
    const downloader = makeDownloader()
    const result = await downloader.download(FIXTURE_BOOK_ID, 'epub')
    const stats = await stat(result.path)
    expect(stats.isFile()).toBe(true)
    expect(stats.size).toBeGreaterThan(0)
  })

  it('creates the storage directory automatically when it does not yet exist', async () => {
    const nestedDir = join(workdir, 'does', 'not', 'exist', 'yet')
    const downloader = makeDownloader({ storageDir: nestedDir })

    const result = await downloader.download(FIXTURE_BOOK_ID, 'epub')

    expect(result.path).toBe(join(nestedDir, `${FIXTURE_BOOK_ID}.epub`))
    await expect(stat(result.path)).resolves.toBeTruthy()
  })

  it('sends User-Agent: dIAlogus/0.1 (+igortullio@gmail.com) on every request', async () => {
    const captured: string[] = []
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), async ({ request }) => {
        captured.push(request.headers.get('user-agent') ?? '')
        const body = await readFile(SAMPLE_EPUB_PATH)
        return new HttpResponse(body)
      }),
    )

    const downloader = makeDownloader()
    await downloader.download(FIXTURE_BOOK_ID, 'epub')

    expect(captured).toEqual(['dIAlogus/0.1 (+igortullio@gmail.com)'])
  })
})

describe('GutendexDownloader.download — jitter', () => {
  it('sleeps a sub-second jitter before each request when maxJitterMs > 0', async () => {
    const sleepDurations: number[] = []
    const downloader = new GutendexDownloader({
      baseUrl: BASE_URL,
      storageDir: join(workdir, 'raw'),
      limiterOptions: { maxConcurrent: 1, minTime: 0 },
      maxJitterMs: 1000,
      retryBaseDelayMs: 1,
      random: () => 0.42,
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })

    await downloader.download(FIXTURE_BOOK_ID, 'epub')
    expect(sleepDurations).toEqual([Math.floor(0.42 * 1000)])
  })
})

describe('GutendexDownloader.download — rate limiting', () => {
  it('serializes back-to-back calls at least minTime=1000ms apart', async () => {
    const requestStartedAt: number[] = []
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), async () => {
        requestStartedAt.push(Date.now())
        const body = await readFile(SAMPLE_EPUB_PATH)
        return new HttpResponse(body)
      }),
    )

    const downloader = new GutendexDownloader({
      baseUrl: BASE_URL,
      storageDir: join(workdir, 'raw'),
      limiterOptions: { maxConcurrent: 1, minTime: 1000 },
      maxJitterMs: 0,
      retryBaseDelayMs: 1,
    })

    await Promise.all([
      downloader.download(FIXTURE_BOOK_ID, 'epub'),
      downloader.download(FIXTURE_BOOK_ID, 'epub'),
    ])

    expect(requestStartedAt).toHaveLength(2)
    const [first, second] = requestStartedAt as [number, number]
    expect(second - first).toBeGreaterThanOrEqual(1000)
  }, 20_000)
})

describe('GutendexDownloader.download — error paths', () => {
  it('throws DownloadError on 404 without retrying', async () => {
    let calls = 0
    server.use(
      http.get(epubUrl(MISSING_BOOK_ID), () => {
        calls += 1
        return HttpResponse.text('not found', { status: 404 })
      }),
    )

    const downloader = makeDownloader()
    await expect(downloader.download(MISSING_BOOK_ID, 'epub')).rejects.toBeInstanceOf(DownloadError)
    expect(calls).toBe(1)
  })

  it('retries 5xx with exponential backoff (500ms, 1000ms) then throws DownloadError', async () => {
    let calls = 0
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), () => {
        calls += 1
        return HttpResponse.text('upstream', { status: 503 })
      }),
    )

    const sleepDurations: number[] = []
    const downloader = new GutendexDownloader({
      baseUrl: BASE_URL,
      storageDir: join(workdir, 'raw'),
      limiterOptions: { maxConcurrent: 1, minTime: 0 },
      maxJitterMs: 0,
      retryBaseDelayMs: 500,
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })

    const error = await downloader.download(FIXTURE_BOOK_ID, 'epub').catch((err) => err)
    expect(error).toBeInstanceOf(DownloadError)
    expect(calls).toBe(3)
    expect(sleepDurations).toEqual([500, 1000])
  })

  it('retries network errors twice and surfaces DownloadError with cause', async () => {
    let calls = 0
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), () => {
        calls += 1
        return HttpResponse.error()
      }),
    )

    const sleepDurations: number[] = []
    const downloader = new GutendexDownloader({
      baseUrl: BASE_URL,
      storageDir: join(workdir, 'raw'),
      limiterOptions: { maxConcurrent: 1, minTime: 0 },
      maxJitterMs: 0,
      retryBaseDelayMs: 500,
      sleep: async (ms) => {
        sleepDurations.push(ms)
      },
    })

    const error = await downloader.download(FIXTURE_BOOK_ID, 'epub').catch((err) => err)
    expect(error).toBeInstanceOf(DownloadError)
    expect(calls).toBe(3)
    expect(sleepDurations).toEqual([500, 1000])
    expect((error as DownloadError).cause).toBeDefined()
  })

  it('recovers when 5xx is followed by a successful response on retry', async () => {
    let calls = 0
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), async () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.text('upstream', { status: 503 })
        }
        const body = await readFile(SAMPLE_EPUB_PATH)
        return new HttpResponse(body)
      }),
    )

    const downloader = makeDownloader()
    const result = await downloader.download(FIXTURE_BOOK_ID, 'epub')
    const expected = await expectedSha256(SAMPLE_EPUB_PATH)
    expect(result.sha256).toBe(expected.sha256)
    expect(calls).toBe(2)
  })
})

describe('GutendexDownloader.download — streaming error cleanup', () => {
  it('throws DownloadError and removes the partial file when the stream errors mid-flight', async () => {
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]))
            controller.error(new Error('mid-stream failure'))
          },
        })
        return new HttpResponse(stream)
      }),
    )

    const downloader = makeDownloader()
    const error = await downloader.download(FIXTURE_BOOK_ID, 'epub').catch((err) => err)
    expect(error).toBeInstanceOf(DownloadError)
    const target = join(workdir, 'raw', `${FIXTURE_BOOK_ID}.epub`)
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('GutendexDownloader.download — streaming discipline', () => {
  it('streams a 10MB payload to disk without buffering it in process heap', async () => {
    const tenMb = 10 * 1024 * 1024
    const chunkSize = 64 * 1024
    server.use(
      http.get(epubUrl(FIXTURE_BOOK_ID), () => {
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            for (let written = 0; written < tenMb; written += chunkSize) {
              const remaining = Math.min(chunkSize, tenMb - written)
              controller.enqueue(new Uint8Array(remaining))
            }
            controller.close()
          },
        })
        return new HttpResponse(stream, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }),
    )

    const downloader = makeDownloader()

    if (typeof globalThis.gc === 'function') {
      globalThis.gc()
    }
    const before = process.memoryUsage().heapUsed

    const result = await downloader.download(FIXTURE_BOOK_ID, 'epub')

    if (typeof globalThis.gc === 'function') {
      globalThis.gc()
    }
    const after = process.memoryUsage().heapUsed

    expect(result.bytes).toBe(tenMb)
    const stats = await stat(result.path)
    expect(stats.size).toBe(tenMb)
    const heapDeltaMb = (after - before) / (1024 * 1024)
    expect(heapDeltaMb).toBeLessThan(20)
  }, 20_000)
})
