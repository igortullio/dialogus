import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MockEmbeddingProvider } from '../../../src/infrastructure/external/MockEmbeddingProvider'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function l2Norm(vector: readonly number[]): number {
  let sum = 0
  for (const v of vector) {
    sum += v * v
  }
  return Math.sqrt(sum)
}

describe('MockEmbeddingProvider', () => {
  it('exposes the EmbeddingProvider port contract', () => {
    const provider = new MockEmbeddingProvider()
    expect(provider.dimensions).toBe(1536)
    expect(typeof provider.modelName).toBe('string')
    expect(provider.modelName.length).toBeGreaterThan(0)
  })

  it('returns a single 1536-dimension vector for embed(["hello"])', async () => {
    const provider = new MockEmbeddingProvider()
    const result = await provider.embed(['hello'])
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(1536)
    expect(result[0]?.every((n) => typeof n === 'number' && Number.isFinite(n))).toBe(true)
  })

  it('returns identical vectors for repeated embed of the same text (deterministic)', async () => {
    const provider = new MockEmbeddingProvider()
    const [first] = await provider.embed(['hello'])
    const [second] = await provider.embed(['hello'])
    expect(first).toEqual(second)
  })

  it('returns 2 unit-length vectors for embed(["hello", "world"])', async () => {
    const provider = new MockEmbeddingProvider()
    const result = await provider.embed(['hello', 'world'])
    expect(result).toHaveLength(2)
    for (const vector of result) {
      expect(vector).toHaveLength(1536)
      expect(l2Norm(vector)).toBeCloseTo(1, 6)
    }
  })

  it('returns different vectors for different inputs (no collision)', async () => {
    const provider = new MockEmbeddingProvider()
    const [hello] = await provider.embed(['hello'])
    const [world] = await provider.embed(['world'])
    expect(hello).not.toEqual(world)
  })

  it('makes zero network calls (MSW assertion via onUnhandledRequest:error)', async () => {
    const provider = new MockEmbeddingProvider()
    // If any HTTP call were issued, MSW would throw because no handlers are registered
    // and `onUnhandledRequest: 'error'` is set on the server above.
    await provider.embed(['a', 'b', 'c'])
    expect(true).toBe(true)
  })

  it('returns empty array for empty input', async () => {
    const provider = new MockEmbeddingProvider()
    const result = await provider.embed([])
    expect(result).toEqual([])
  })
})
