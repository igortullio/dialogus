import { createHash } from 'node:crypto'
import type { QueryEmbedder } from '../../domain/ports/QueryEmbedder.port'

const DIMENSIONS = 1536
const MODEL_NAME = 'mock-query-embedder'

export class MockQueryEmbedder implements QueryEmbedder {
  readonly dimensions = 1536 as const
  readonly modelName = MODEL_NAME

  async embed(query: string): Promise<number[]> {
    return generateUnitVector(query)
  }
}

function generateUnitVector(text: string): number[] {
  const seed = createHash('sha256').update(text, 'utf8').digest()
  const next = makeXorshift128(seed)
  const vector = new Array<number>(DIMENSIONS)
  let normSq = 0
  for (let i = 0; i < DIMENSIONS; i += 1) {
    const value = next() * 2 - 1
    vector[i] = value
    normSq += value * value
  }
  if (normSq === 0) {
    vector[0] = 1
    return vector
  }
  const norm = Math.sqrt(normSq)
  for (let i = 0; i < DIMENSIONS; i += 1) {
    vector[i] = (vector[i] as number) / norm
  }
  return vector
}

function makeXorshift128(seed: Buffer): () => number {
  let x = seed.readUInt32BE(0) || 0xdeadbeef
  let y = seed.readUInt32BE(4) || 0xfeedface
  let z = seed.readUInt32BE(8) || 0xcafebabe
  let w = seed.readUInt32BE(12) || 0xb0bafe77
  return function next(): number {
    const t = (x ^ (x << 11)) >>> 0
    x = y
    y = z
    z = w
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0
    return w / 0x1_0000_0000
  }
}
