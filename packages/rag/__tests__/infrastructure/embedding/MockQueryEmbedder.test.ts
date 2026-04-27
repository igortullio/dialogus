import { describe, expect, it } from 'vitest'
import { MockQueryEmbedder } from '../../../src/infrastructure/embedding/MockQueryEmbedder'

describe('MockQueryEmbedder — port contract', () => {
  it('exposes dimensions=1536 and modelName="mock-query-embedder"', () => {
    const embedder = new MockQueryEmbedder()
    expect(embedder.dimensions).toBe(1536)
    expect(embedder.modelName).toBe('mock-query-embedder')
  })
})

describe('MockQueryEmbedder.embed', () => {
  it('returns a 1536-dim numeric vector', async () => {
    const embedder = new MockQueryEmbedder()
    const vector = await embedder.embed('hello')
    expect(vector).toHaveLength(1536)
    expect(vector.every((value) => typeof value === 'number' && Number.isFinite(value))).toBe(true)
  })

  it('is deterministic — same input yields identical vectors across calls', async () => {
    const embedder = new MockQueryEmbedder()
    const a = await embedder.embed('hello')
    const b = await embedder.embed('hello')
    expect(a).toEqual(b)
  })

  it('produces different vectors for different inputs', async () => {
    const embedder = new MockQueryEmbedder()
    const hello = await embedder.embed('hello')
    const world = await embedder.embed('world')
    expect(hello).toHaveLength(world.length)
    const someDiffer = hello.some((value, index) => value !== world[index])
    expect(someDiffer).toBe(true)
  })

  it('returns a unit-length vector (||v||₂ ≈ 1)', async () => {
    const embedder = new MockQueryEmbedder()
    const vector = await embedder.embed('the quick brown fox')
    const sumSquares = vector.reduce((acc, value) => acc + value * value, 0)
    expect(sumSquares).toBeGreaterThan(1 - 1e-9)
    expect(sumSquares).toBeLessThan(1 + 1e-9)
  })

  it('completes in under 10ms on dev hardware', async () => {
    const embedder = new MockQueryEmbedder()
    const start = performance.now()
    await embedder.embed('latency budget probe')
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(10)
  })

  it('returns a vector for an empty string without throwing', async () => {
    const embedder = new MockQueryEmbedder()
    const vector = await embedder.embed('')
    expect(vector).toHaveLength(1536)
  })
})
