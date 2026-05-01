import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import Bottleneck from 'bottleneck'
import { DownloadError } from '../../domain/ingestion/IngestionError'

export type DownloadFormat = 'epub' | 'txt'

export interface GutendexDownloaderResult {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface GutendexDownloaderOptions {
  readonly baseUrl?: string
  readonly userAgent?: string
  readonly storageDir?: string
  readonly fetchImpl?: typeof fetch
  readonly limiterOptions?: ConstructorParameters<typeof Bottleneck>[0]
  readonly maxRetries?: number
  readonly retryBaseDelayMs?: number
  readonly maxJitterMs?: number
  readonly random?: () => number
  readonly sleep?: (ms: number) => Promise<void>
}

const DEFAULT_BASE_URL = 'https://www.gutenberg.org'
const DEFAULT_USER_AGENT = 'dIAlogus/0.1 (+igortullio@gmail.com)'
const DEFAULT_STORAGE_DIR = './storage/raw'
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_MAX_JITTER_MS = 1000
const DEFAULT_LIMITER_OPTIONS = { maxConcurrent: 1, minTime: 1000 }

const FORMAT_EXTENSION: Record<DownloadFormat, string> = {
  epub: 'epub',
  txt: 'txt',
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GutendexDownloader {
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly storageDir: string
  private readonly fetchImpl: typeof fetch
  private readonly limiter: Bottleneck
  private readonly maxRetries: number
  private readonly retryBaseDelayMs: number
  private readonly maxJitterMs: number
  private readonly random: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: GutendexDownloaderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.storageDir = options.storageDir ?? DEFAULT_STORAGE_DIR
    this.fetchImpl = options.fetchImpl ?? fetch
    this.limiter = new Bottleneck(options.limiterOptions ?? DEFAULT_LIMITER_OPTIONS)
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    this.maxJitterMs = options.maxJitterMs ?? DEFAULT_MAX_JITTER_MS
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? defaultSleep
  }

  async download(gutendexId: number, format: DownloadFormat): Promise<GutendexDownloaderResult> {
    return this.limiter.schedule(() => this.executeDownload(gutendexId, format))
  }

  private async executeDownload(
    gutendexId: number,
    format: DownloadFormat,
  ): Promise<GutendexDownloaderResult> {
    if (this.maxJitterMs > 0) {
      await this.sleep(Math.floor(this.random() * this.maxJitterMs))
    }
    const url = this.buildUrl(gutendexId, format)
    const destination = join(this.storageDir, `${gutendexId}.${FORMAT_EXTENSION[format]}`)
    await mkdir(dirname(destination), { recursive: true })

    const response = await this.fetchWithRetry(url)
    return this.streamToDisk(response, destination)
  }

  private buildUrl(gutendexId: number, format: DownloadFormat): string {
    const path =
      format === 'epub'
        ? `/cache/epub/${gutendexId}/pg${gutendexId}.epub`
        : `/cache/epub/${gutendexId}/pg${gutendexId}.txt`
    return `${this.baseUrl}${path}`
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let attempt = 0
    let lastError: unknown = null
    while (attempt <= this.maxRetries) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { 'user-agent': this.userAgent },
        })
        if (response.ok) {
          return response
        }
        if (response.status >= 400 && response.status < 500) {
          await this.discardBody(response)
          throw new DownloadError(`Gutenberg responded ${response.status} for ${url}`, {
            retryable: false,
          })
        }
        await this.discardBody(response)
        lastError = new DownloadError(`Gutenberg responded ${response.status} for ${url}`)
      } catch (error) {
        if (error instanceof DownloadError && !error.retryable) {
          throw error
        }
        lastError = error
      }
      if (attempt >= this.maxRetries) {
        break
      }
      const delay = this.retryBaseDelayMs * 2 ** attempt
      await this.sleep(delay)
      attempt += 1
    }
    throw new DownloadError(`Download failed for ${url} after ${attempt + 1} attempt(s)`, {
      cause: lastError,
    })
  }

  private async discardBody(response: Response): Promise<void> {
    try {
      await response.text()
    } catch {
      /* ignore drain errors — body is already discarded */
    }
  }

  private async streamToDisk(
    response: Response,
    destination: string,
  ): Promise<GutendexDownloaderResult> {
    if (!response.body) {
      throw new DownloadError(`Empty response body for ${destination}`)
    }
    const hash = createHash('sha256')
    let bytes = 0
    const measure = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk)
        bytes += chunk.length
        callback(null, chunk)
      },
    })
    const fileStream = createWriteStream(destination)
    const webStream = response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
    try {
      await pipeline(Readable.fromWeb(webStream), measure, fileStream)
    } catch (error) {
      await unlink(destination).catch(() => {
        /* best-effort cleanup */
      })
      throw new DownloadError(`Streaming to ${destination} failed`, { cause: error })
    }
    return { path: destination, sha256: hash.digest('hex'), bytes }
  }
}
