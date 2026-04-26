/**
 * Deterministic synthetic plain-text book generator for ingestion integration tests.
 * Words come from a fixed lexicon; ordering is driven by a seeded xorshift32 RNG so
 * the same options always produce identical bytes. Chapter markers use the EN
 * heuristics regex `^CHAPTER\\s+[IVXLCDM]+\\.?\\s*$`.
 */

const LEXICON: readonly string[] = [
  'whale',
  'horizon',
  'silver',
  'thunder',
  'voyage',
  'mariner',
  'compass',
  'fathom',
  'salt',
  'wind',
  'cresting',
  'midnight',
  'lantern',
  'parchment',
  'shore',
  'tempest',
  'island',
  'glimmer',
  'forecastle',
  'doubloon',
  'ledger',
  'harpoon',
  'omen',
  'verdant',
  'pewter',
  'crimson',
  'evening',
  'glacier',
  'tundra',
  'cathedral',
  'ember',
  'ironwood',
  'mosaic',
  'chronicle',
  'archive',
  'pendulum',
  'astrolabe',
  'meridian',
  'firmament',
  'bulwark',
  'quill',
  'parable',
  'tapestry',
  'almanac',
  'cobalt',
  'auburn',
  'driftwood',
  'sextant',
  'manifold',
  'mariners',
] as const

export interface GenerateBookOptions {
  /** Approximate total token target. ~1 token per 0.75 words for cl100k_base, but we
   *  compute counts as `wordCount` directly (cl100k tokens are usually ≤ word count).
   *  Pass enough words to comfortably exceed the desired token floor.
   */
  readonly approximateWordCount: number
  /** Number of CHAPTER markers to emit (Roman numerals I, II, …). */
  readonly chapterCount: number
  /** Random seed for determinism. Same seed → same output bytes. */
  readonly seed?: number
  /** Number of words per paragraph; defaults to 40. */
  readonly wordsPerParagraph?: number
}

export interface GeneratedBook {
  readonly text: string
  readonly chapterCount: number
  readonly wordCount: number
  readonly byteLength: number
}

export function generateLargeBook(options: GenerateBookOptions): GeneratedBook {
  const wordsTotal = Math.max(1, Math.floor(options.approximateWordCount))
  const chapterCount = Math.max(1, Math.floor(options.chapterCount))
  const wordsPerParagraph = Math.max(8, options.wordsPerParagraph ?? 40)
  const seed = options.seed ?? 0xdeadbeef
  const rng = makeXorshift32(seed)

  const wordsPerChapter = Math.max(50, Math.floor(wordsTotal / chapterCount))
  const parts: string[] = []
  let actualWordCount = 0

  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    parts.push(`CHAPTER ${toRoman(chapter)}.`)
    parts.push('')
    let wordsInChapter = 0
    while (wordsInChapter < wordsPerChapter) {
      const paragraphLength = Math.min(wordsPerParagraph, wordsPerChapter - wordsInChapter)
      const words = new Array<string>(paragraphLength)
      for (let i = 0; i < paragraphLength; i += 1) {
        const idx = Math.floor(rng() * LEXICON.length)
        words[i] = LEXICON[idx] ?? 'word'
      }
      parts.push(`${words.join(' ')}.`)
      parts.push('')
      wordsInChapter += paragraphLength
      actualWordCount += paragraphLength
    }
  }

  const text = parts.join('\n').replace(/\n+$/, '\n')
  return {
    text,
    chapterCount,
    wordCount: actualWordCount,
    byteLength: Buffer.byteLength(text, 'utf8'),
  }
}

function toRoman(n: number): string {
  const values: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let remaining = n
  let out = ''
  for (const [v, s] of values) {
    while (remaining >= v) {
      out += s
      remaining -= v
    }
  }
  return out
}

function makeXorshift32(seed: number): () => number {
  let state = seed >>> 0
  if (state === 0) state = 0x1
  return function next(): number {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state >>>= 0
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}
