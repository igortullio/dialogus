import { createHash } from 'node:crypto'
import type { Database } from '@dialogus/db'
import { idempotencyKeys } from '@dialogus/db/schema'
import { IdempotencyKeyConflictError } from '@dialogus/shared/errors'
import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'

const REPLAY_HEADER = 'X-Idempotency-Replay'
const JSON_CONTENT_TYPE = 'application/json'

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue }

function toCanonical(value: unknown): CanonicalValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toCanonical)
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: { [key: string]: CanonicalValue } = {}
    for (const key of Object.keys(source).sort()) {
      sorted[key] = toCanonical(source[key])
    }
    return sorted
  }
  return null
}

export function canonicalizeBody(body: unknown): string {
  return JSON.stringify(toCanonical(body))
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export interface IdempotencyMiddlewareDeps {
  db: Database
  logger?: Logger
}

interface StoredIdempotencyRow {
  requestHash: string
  responseStatus: number
  responseBody: unknown
}

function buildReplayResponse(row: StoredIdempotencyRow): Response {
  return new Response(JSON.stringify(row.responseBody), {
    status: row.responseStatus,
    headers: {
      'content-type': JSON_CONTENT_TYPE,
      [REPLAY_HEADER]: 'true',
    },
  })
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.clone().text()
  if (text.length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function idempotency(deps: IdempotencyMiddlewareDeps): MiddlewareHandler {
  return async (c, next) => {
    const key = c.req.header('Idempotency-Key')
    if (!key) {
      await next()
      return
    }

    let body: unknown = null
    try {
      body = await c.req.json()
    } catch {
      body = null
    }
    const requestHash = sha256Hex(canonicalizeBody(body))
    const path = c.req.path

    const rows = await deps.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1)
    const existing = rows[0]

    if (existing) {
      if (existing.requestHash !== requestHash) {
        deps.logger?.warn(
          { idempotency_key: key, action: 'conflict', path },
          'idempotency conflict',
        )
        throw new IdempotencyKeyConflictError(key)
      }
      deps.logger?.info(
        { idempotency_key: key, action: 'replay', status: existing.responseStatus, path },
        'idempotency replay',
      )
      c.res = buildReplayResponse(existing)
      return
    }

    await next()

    const status = c.res.status
    if (status < 200 || status >= 300) return

    const responseBody = await readResponseBody(c.res)
    await deps.db.insert(idempotencyKeys).values({
      key,
      requestHash,
      responseStatus: status,
      responseBody: responseBody as object,
    })
    deps.logger?.info(
      { idempotency_key: key, action: 'insert', status, path },
      'idempotency insert',
    )
  }
}
