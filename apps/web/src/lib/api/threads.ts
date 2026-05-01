import {
  type ThreadMetadata,
  type ThreadMetadataUpdate,
  threadMetadataSchema,
} from '@dialogus/shared/schemas/thread'
import { MASTRA_THREAD_METADATA_AVAILABLE } from '../feature-flags'
import { apiBaseUrl, fetchEnvelope, fetchVoid, mastraBaseUrl } from './_envelope'
import { ApiError, isProblemDetails, SchemaError, slugFromProblemType } from './_error'
import { type Thread, threadListSchema, threadSchema } from './_schemas'

const FALLBACK_BASE = '/api/library/threads'
const MASTRA_BASE = '/api/memory/threads'
const MASTRA_AGENT_ID = 'dialogusAgent'
const DEFAULT_METADATA: ThreadMetadata = { custom_title: null, pinned: false }

const useMastra: boolean = MASTRA_THREAD_METADATA_AVAILABLE

if (
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_RUNTIME !== 'edge' &&
  typeof window === 'undefined'
) {
  console.info(`[threads] metadata path: ${useMastra ? 'mastra' : 'apps/api fallback'}`)
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

async function mastraFetch<T>(
  path: string,
  init: RequestInit,
  parse: (raw: unknown) => T,
  where: string,
): Promise<T> {
  const url = `${mastraBaseUrl().replace(/\/+$/, '')}${path}`
  const response = await fetch(url, init)
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

export async function listThreads(): Promise<Thread[]> {
  if (useMastra) {
    return mastraFetch(`${MASTRA_BASE}`, { method: 'GET' }, parseThreadList, 'listThreads')
  }
  const envelope = await fetchEnvelope(apiBaseUrl(), FALLBACK_BASE, {
    schema: threadListSchema,
    where: 'listThreads',
  })
  return envelope.data
}

export async function deleteThread(id: string): Promise<void> {
  if (useMastra) {
    await mastraFetch(
      `${MASTRA_BASE}/${id}?agentId=${MASTRA_AGENT_ID}`,
      { method: 'DELETE' },
      () => undefined,
      'deleteThread',
    )
    return
  }
  await fetchVoid(apiBaseUrl(), `${FALLBACK_BASE}/${id}`, {
    method: 'DELETE',
    where: 'deleteThread',
  })
}

export async function fetchThreadMetadata(id: string): Promise<ThreadMetadata> {
  if (useMastra) {
    const thread = await mastraFetch(
      `${MASTRA_BASE}/${id}?agentId=${MASTRA_AGENT_ID}`,
      { method: 'GET' },
      parseThread,
      'fetchThreadMetadata',
    )
    return metadataFromThread(thread)
  }
  const envelope = await fetchEnvelope(apiBaseUrl(), `${FALLBACK_BASE}/${id}/metadata`, {
    schema: threadMetadataSchema,
    where: 'fetchThreadMetadata',
  })
  return envelope.data
}

export async function updateThreadMetadata(
  id: string,
  partial: ThreadMetadataUpdate,
): Promise<ThreadMetadata> {
  if (useMastra) {
    const merged: ThreadMetadata = { ...DEFAULT_METADATA, ...partial }
    const thread = await mastraFetch(
      `${MASTRA_BASE}/${id}?agentId=${MASTRA_AGENT_ID}`,
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
  const envelope = await fetchEnvelope(apiBaseUrl(), `${FALLBACK_BASE}/${id}/metadata`, {
    method: 'PUT',
    body: partial,
    schema: threadMetadataSchema,
    where: 'updateThreadMetadata',
  })
  return envelope.data
}
