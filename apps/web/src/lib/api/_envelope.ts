import type { z } from 'zod'
import { ApiError, isProblemDetails, SchemaError, slugFromProblemType } from './_error'

export interface Envelope<T> {
  data: T
  meta?: Record<string, unknown>
  links?: Record<string, string | null>
}

const DEFAULT_API_BASE = 'http://localhost:3001'
const DEFAULT_MASTRA_BASE = 'http://localhost:3002'

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE
}

export function mastraBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MASTRA_URL ?? DEFAULT_MASTRA_BASE
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly query?: Record<string, string | number | boolean | undefined | null>
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!query) return `${trimmedBase}${normalizedPath}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const queryString = params.toString()
  return queryString
    ? `${trimmedBase}${normalizedPath}?${queryString}`
    : `${trimmedBase}${normalizedPath}`
}

async function readBodySafe(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function throwApiError(response: Response, where: string): Promise<never> {
  const body = await readBodySafe(response)
  if (isProblemDetails(body)) {
    throw new ApiError(response.status, {
      slug: slugFromProblemType(body.type),
      title: body.title ?? null,
      detail: body.detail ?? null,
      problem: body,
    })
  }
  const detail =
    typeof body === 'string' && body.length > 0
      ? body
      : body && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `HTTP ${response.status} (${where})`
  throw new ApiError(response.status, { detail })
}

export interface FetchEnvelopeOptions<TSchema extends z.ZodType> extends RequestOptions {
  readonly schema: TSchema
  readonly where: string
}

function buildRequestInit(options: RequestOptions): RequestInit {
  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers['content-type'] = headers['content-type'] ?? 'application/json'
  }
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    cache: 'no-store',
  }
  if (body !== undefined) init.body = body
  return init
}

function unwrapPayload(payload: unknown): {
  data: unknown
  meta: Record<string, unknown> | undefined
  links: Record<string, string | null> | undefined
} {
  if (!payload || typeof payload !== 'object') {
    return { data: payload, meta: undefined, links: undefined }
  }
  const root = payload as Record<string, unknown>
  const data = 'data' in root ? root.data : payload
  const meta =
    root.meta && typeof root.meta === 'object' ? (root.meta as Record<string, unknown>) : undefined
  const links =
    root.links && typeof root.links === 'object'
      ? (root.links as Record<string, string | null>)
      : undefined
  return { data, meta, links }
}

export async function fetchEnvelope<TSchema extends z.ZodType>(
  base: string,
  path: string,
  options: FetchEnvelopeOptions<TSchema>,
): Promise<Envelope<z.infer<TSchema>>> {
  const url = buildUrl(base, path, options.query)
  const response = await fetch(url, buildRequestInit(options))
  if (!response.ok) await throwApiError(response, options.where)
  const payload = await readBodySafe(response)
  const { data, meta, links } = unwrapPayload(payload)
  const parsed = options.schema.safeParse(data)
  if (!parsed.success) throw new SchemaError(parsed.error, options.where)
  const envelope: Envelope<z.infer<TSchema>> = { data: parsed.data as z.infer<TSchema> }
  if (meta) envelope.meta = meta
  if (links) envelope.links = links
  return envelope
}

export async function fetchVoid(
  base: string,
  path: string,
  options: RequestOptions & { readonly where: string } = { where: 'request' },
): Promise<void> {
  const url = buildUrl(base, path, options.query)
  const init = buildRequestInit(options)
  const response = await fetch(url, init)
  if (!response.ok) {
    await throwApiError(response, options.where)
  }
}

export function nextCursorFromLinks(
  links: Record<string, string | null> | undefined,
): string | null {
  if (!links) return null
  const next = links.next
  if (typeof next !== 'string' || next.length === 0) return null
  try {
    const parsed = new URL(next, 'http://placeholder')
    const cursor = parsed.searchParams.get('cursor')
    return cursor && cursor.length > 0 ? cursor : null
  } catch {
    return null
  }
}
