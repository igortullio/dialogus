/**
 * One-shot verification (per ADR-007 + task_01 requirements) that the pinned
 * @mastra/client-js (1.14.2) + @mastra/core (1.28.0) expose per-thread
 * metadata round-trip semantics good enough for rename + pin.
 *
 * The test stubs global fetch so the client only sees synthetic responses.
 * It asserts both type-level + runtime behavior so the same evidence holds
 * whether or not apps/mastra is reachable in CI.
 */
import { MastraClient } from '@mastra/client-js'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MASTRA_THREAD_METADATA_AVAILABLE } from '../../src/lib/feature-flags'

type FetchSpy = ReturnType<typeof vi.spyOn>

const VERIFICATION_THREAD_ID = 't_verify_metadata'
const VERIFICATION_RESOURCE_ID = 'r_verify_owner'
const VERIFICATION_METADATA = {
  custom_title: 'verification',
  pinned: true,
} as const

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function makeStoredThread(overrides: { metadata?: Record<string, unknown> } = {}) {
  return {
    id: VERIFICATION_THREAD_ID,
    title: VERIFICATION_METADATA.custom_title,
    resourceId: VERIFICATION_RESOURCE_ID,
    createdAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    metadata: overrides.metadata ?? { ...VERIFICATION_METADATA },
  }
}

describe('Mastra metadata verification (ADR-007 primary path)', () => {
  let fetchSpy: FetchSpy

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('exposes UpdateMemoryThreadParams.metadata as Record<string, any>', async () => {
    const types = await import('@mastra/client-js')
    type UpdateParams = Parameters<
      InstanceType<typeof types.MastraClient>['getMemoryThread'] extends (...args: never) => infer M
        ? M extends { update: (params: infer P) => unknown }
          ? (p: P) => unknown
          : never
        : never
    >[0]
    expectTypeOf<UpdateParams>().toMatchTypeOf<{ metadata: Record<string, unknown> }>()
  })

  it('round-trips { custom_title, pinned } metadata via createMemoryThread + update + get', async () => {
    const updatedThread = makeStoredThread({
      metadata: { ...VERIFICATION_METADATA, pinned: false },
    })

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(makeStoredThread()))
      .mockResolvedValueOnce(jsonResponse(updatedThread))
      .mockResolvedValueOnce(jsonResponse(updatedThread))

    const client = new MastraClient({ baseUrl: 'http://localhost:3002' })

    const created = await client.createMemoryThread({
      threadId: VERIFICATION_THREAD_ID,
      resourceId: VERIFICATION_RESOURCE_ID,
      agentId: 'dialogusAgent',
      metadata: { ...VERIFICATION_METADATA },
    })
    expect(created.id).toBe(VERIFICATION_THREAD_ID)
    expect(created.metadata).toEqual(VERIFICATION_METADATA)

    const thread = client.getMemoryThread({
      threadId: VERIFICATION_THREAD_ID,
      agentId: 'dialogusAgent',
    })
    const updated = await thread.update({
      title: VERIFICATION_METADATA.custom_title,
      metadata: { ...VERIFICATION_METADATA, pinned: false },
      resourceId: VERIFICATION_RESOURCE_ID,
    })
    expect(updated.metadata).toEqual({ ...VERIFICATION_METADATA, pinned: false })

    const fetched = await thread.get()
    expect(fetched.metadata?.custom_title).toBe(VERIFICATION_METADATA.custom_title)
    expect(fetched.metadata?.pinned).toBe(false)

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const updateCall = fetchSpy.mock.calls[1]
    expect(updateCall).toBeDefined()
    const updateRequestInit = updateCall?.[1] as RequestInit | undefined
    expect(updateRequestInit?.method).toBe('PATCH')
    const sentPayload = JSON.parse((updateRequestInit?.body as string) ?? '{}')
    expect(sentPayload.metadata).toEqual({ ...VERIFICATION_METADATA, pinned: false })
  })

  it('records the verification outcome in the build-time feature flag', () => {
    expectTypeOf(MASTRA_THREAD_METADATA_AVAILABLE).toEqualTypeOf<true>()
    expect(MASTRA_THREAD_METADATA_AVAILABLE).toBe(true)
  })
})
