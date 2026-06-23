import type { ThreadMetadata, ThreadMetadataUpdate } from '@dialogus/shared/schemas/thread'
import { ApiError, isProblemDetails, SchemaError, slugFromProblemType } from './_error'
import { type Thread, threadListSchema, threadSchema } from './_schemas'

// All thread operations go through the same-origin authenticated proxy in
// app/api/memory/threads/**, which reads the Better Auth session server-side
// and scopes every call to the user's resourceId. The browser never talks to
// Mastra directly (that would bypass per-user isolation — FR-006).
const THREADS_BASE = '/api/memory/threads'

async function readBodySafe(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function proxyFetch<T>(
  path: string,
  init: RequestInit,
  parse: (raw: unknown) => T,
  where: string,
): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include', cache: 'no-store' })
  const body = await readBodySafe(response)
  if (!response.ok) {
    if (isProblemDetails(body)) {
      throw new ApiError(response.status, {
        slug: slugFromProblemType(body.type),
        title: body.title ?? null,
        detail: body.detail ?? null,
        problem: body,
      })
    }
    const detail =
      typeof body === 'string' && body.length > 0 ? body : `HTTP ${response.status} (${where})`
    throw new ApiError(response.status, { detail })
  }
  return parse(body)
}

function parseThreadList(raw: unknown): Thread[] {
  const candidate =
    raw && typeof raw === 'object' && raw !== null && 'threads' in raw
      ? (raw as { threads: unknown }).threads
      : raw
  const result = threadListSchema.safeParse(candidate)
  if (!result.success) throw new SchemaError(result.error, 'listThreads')
  return result.data
}

function parseThread(raw: unknown): Thread {
  const result = threadSchema.safeParse(raw)
  if (!result.success) throw new SchemaError(result.error, 'thread')
  return result.data
}

function metadataFromThread(thread: Thread): ThreadMetadata {
  return {
    custom_title: thread.metadata?.custom_title ?? null,
    pinned: thread.metadata?.pinned ?? false,
  }
}

export interface ThreadMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system' | 'tool'
  readonly text: string
  readonly createdAt: string | null
}

interface RawMastraMessage {
  id?: unknown
  role?: unknown
  content?: unknown
  createdAt?: unknown
  type?: unknown
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  // Mastra's persisted messages use a v2 envelope: `{ format: 2, parts: [...] }`
  // where parts contains text segments and tool invocations. We unwrap it
  // here so older array-shaped payloads (and direct strings) still work.
  let parts: unknown
  if (Array.isArray(content)) {
    parts = content
  } else if (content && typeof content === 'object') {
    parts = (content as { parts?: unknown }).parts
  } else {
    return ''
  }
  if (!Array.isArray(parts)) return ''
  let out = ''
  for (const part of parts) {
    if (part && typeof part === 'object') {
      const p = part as { type?: unknown; text?: unknown }
      if (p.type === 'text' && typeof p.text === 'string') out += p.text
    }
  }
  return out
}

function extractMessagesArray(raw: unknown): unknown[] {
  const candidate =
    raw && typeof raw === 'object' && raw !== null && 'messages' in raw
      ? (raw as { messages: unknown }).messages
      : raw
  return Array.isArray(candidate) ? candidate : []
}

// Matches the `[Available books: ...]` (optionally `; Spoiler caps: {...}`)
// prefix that the stream proxy injects into the latest user message. Stripped
// on hydration so the user sees only what they originally typed.
const BOOKS_PREFIX_RE = /^\[Available books:[^\]]*\]\n?/

function toThreadMessage(item: RawMastraMessage): ThreadMessage | null {
  const role = item.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') return null
  if (item.type !== undefined && item.type !== 'text') return null
  const raw = extractText(item.content)
  const text = role === 'user' ? raw.replace(BOOKS_PREFIX_RE, '') : raw
  if (text.length === 0) return null
  return {
    id: typeof item.id === 'string' ? item.id : '',
    role,
    text,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
  }
}

function parseThreadMessages(raw: unknown): ThreadMessage[] {
  const out: ThreadMessage[] = []
  for (const item of extractMessagesArray(raw) as RawMastraMessage[]) {
    const msg = toThreadMessage(item)
    if (msg !== null) out.push(msg)
  }
  return out
}

export async function fetchThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  return proxyFetch(
    `${THREADS_BASE}/${threadId}/messages`,
    { method: 'GET' },
    parseThreadMessages,
    'fetchThreadMessages',
  )
}

export async function listThreads(): Promise<Thread[]> {
  return proxyFetch(THREADS_BASE, { method: 'GET' }, parseThreadList, 'listThreads')
}

export async function deleteThread(id: string): Promise<void> {
  await proxyFetch(`${THREADS_BASE}/${id}`, { method: 'DELETE' }, () => undefined, 'deleteThread')
}

export async function fetchThreadMetadata(id: string): Promise<ThreadMetadata> {
  const thread = await proxyFetch(
    `${THREADS_BASE}/${id}`,
    { method: 'GET' },
    parseThread,
    'fetchThreadMetadata',
  )
  return metadataFromThread(thread)
}

export async function updateThreadMetadata(
  id: string,
  partial: ThreadMetadataUpdate,
): Promise<ThreadMetadata> {
  // Mastra's PATCH /threads/:id replaces metadata wholesale, so we read the
  // current server state and merge `partial` onto it. Otherwise unrelated keys
  // (custom_title, book_ids) get wiped on every pin/rename. We bypass
  // parseThread on the read so unknown keys (book_ids) survive the round-trip.
  const currentRaw = await proxyFetch(
    `${THREADS_BASE}/${id}`,
    { method: 'GET' },
    (raw: unknown) => raw,
    'updateThreadMetadata.read',
  )
  const currentMetadata =
    currentRaw && typeof currentRaw === 'object' && 'metadata' in currentRaw
      ? ((currentRaw as { metadata?: unknown }).metadata ?? {})
      : {}
  const merged = {
    ...(currentMetadata as Record<string, unknown>),
    ...partial,
  } as Record<string, unknown>
  const thread = await proxyFetch(
    `${THREADS_BASE}/${id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: merged }),
    },
    parseThread,
    'updateThreadMetadata',
  )
  return metadataFromThread(thread)
}
