import { describe, expect, it } from 'vitest'
import {
  initialParserState,
  MARKER_BUFFER_BAILOUT_LENGTH,
  type ParserState,
  parseStream,
  type Token,
} from '../../src/lib/citation-parser'

const UUID_1 = '01234567-89ab-cdef-0123-456789abcdef'
const UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'
const UUID_3 = 'fedcba98-7654-3210-fedc-ba9876543210'

function feed(
  deltas: string[],
  state: ParserState = initialParserState(),
): {
  tokens: Token[]
  nextState: ParserState
} {
  let s = state
  const acc: Token[] = []
  for (const delta of deltas) {
    const out = parseStream(delta, s)
    acc.push(...out.tokens)
    s = out.nextState
  }
  return { tokens: acc, nextState: s }
}

describe('initialParserState', () => {
  it('returns a fresh text state', () => {
    expect(initialParserState()).toEqual({ kind: 'text' })
  })

  it('returns a new object on each call (no shared reference)', () => {
    expect(initialParserState()).not.toBe(initialParserState())
  })
})

describe('parseStream — text-only paths', () => {
  it('emits a single text token for plain text', () => {
    const out = parseStream('hello', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'hello' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('treats a single open brace surrounded by chars as plain text', () => {
    const out = parseStream('a{b', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'a{b' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('treats a single closing brace as plain text in text state', () => {
    const out = parseStream('foo}bar', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'foo}bar' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('treats `}}` in text state as plain text', () => {
    const out = parseStream('a}}b', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'a}}b' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('returns no tokens and unchanged state for an empty delta in text state', () => {
    const state: ParserState = { kind: 'text' }
    const out = parseStream('', state)
    expect(out.tokens).toEqual([])
    expect(out.nextState).toBe(state)
  })

  it('preserves whitespace and unicode in text', () => {
    const out = parseStream('olá  mundo — 🌍', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'olá  mundo — 🌍' }])
  })
})

describe('parseStream — entering marker_pending', () => {
  it('flushes preceding text and transitions on `{{`', () => {
    const out = parseStream('hello {{', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'text', text: 'hello ' }])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: '' })
  })

  it('transitions immediately when delta starts with `{{`', () => {
    const out = parseStream('{{cite:', initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: 'cite:' })
  })

  it('does not flush an empty text buffer when transitioning', () => {
    const out = parseStream('{{', initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: '' })
  })
})

describe('parseStream — accumulating in marker_pending', () => {
  it('accumulates chars without emitting in marker_pending', () => {
    const out = parseStream('cite:abc', { kind: 'marker_pending', buffer: '' })
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: 'cite:abc' })
  })

  it('appends to an existing buffer', () => {
    const out = parseStream('def', { kind: 'marker_pending', buffer: 'cite:abc' })
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: 'cite:abcdef' })
  })

  it('returns no tokens and unchanged state for an empty delta in marker_pending', () => {
    const state: ParserState = { kind: 'marker_pending', buffer: 'cite:abc' }
    const out = parseStream('', state)
    expect(out.tokens).toEqual([])
    expect(out.nextState).toBe(state)
  })

  it('keeps a single trailing `}` in the buffer when delta ends with one brace', () => {
    const out = parseStream(`{{cite:${UUID_1}}`, initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({
      kind: 'marker_pending',
      buffer: `cite:${UUID_1}}`,
    })
  })
})

describe('parseStream — closing markers', () => {
  it('emits a citation when a complete valid marker arrives in one delta', () => {
    const out = parseStream(`{{cite:${UUID_1}}}`, initialParserState())
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_1 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('closes a marker when buffer carries the prefix and `}}` arrives later', () => {
    const out = parseStream(`${UUID_1.slice(8)}}}`, {
      kind: 'marker_pending',
      buffer: `cite:${UUID_1.slice(0, 8)}`,
    })
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_1 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits text + citation + text for a marker between text in one delta', () => {
    const out = parseStream(`hello {{cite:${UUID_1}}}!`, initialParserState())
    expect(out.tokens).toEqual([
      { kind: 'text', text: 'hello ' },
      { kind: 'citation', chunkId: UUID_1 },
      { kind: 'text', text: '!' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits five tokens for two adjacent markers separated by single chars', () => {
    const out = parseStream(`a{{cite:${UUID_1}}}b{{cite:${UUID_2}}}c`, initialParserState())
    expect(out.tokens).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'citation', chunkId: UUID_1 },
      { kind: 'text', text: 'b' },
      { kind: 'citation', chunkId: UUID_2 },
      { kind: 'text', text: 'c' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits multiple citations back to back', () => {
    const out = parseStream(`{{cite:${UUID_1}}}{{cite:${UUID_2}}}`, initialParserState())
    expect(out.tokens).toEqual([
      { kind: 'citation', chunkId: UUID_1 },
      { kind: 'citation', chunkId: UUID_2 },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })
})

describe('parseStream — split markers across deltas', () => {
  it('reassembles a marker split between {{ and the body', () => {
    const out = feed(['hello {{', `cite:${UUID_1}}}`])
    expect(out.tokens).toEqual([
      { kind: 'text', text: 'hello ' },
      { kind: 'citation', chunkId: UUID_1 },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('reassembles a marker split inside the UUID', () => {
    const head = `{{cite:${UUID_1.slice(0, 10)}`
    const tail = `${UUID_1.slice(10)}}}`
    const out = feed([head, tail])
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_1 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('reassembles a marker split between the two closing braces', () => {
    const out = feed([`{{cite:${UUID_1}}`, '}'])
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_1 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('reassembles a marker split into many small fragments inside the body', () => {
    const fragments = [
      '{{',
      'cit',
      'e:',
      UUID_1.slice(0, 4),
      UUID_1.slice(4, 12),
      UUID_1.slice(12),
      '}',
      '}',
    ]
    const out = feed(fragments)
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_1 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits a lone `{` as text when a delta ends with one open brace (split-{{ limitation)', () => {
    const out = feed(['hello {', '{cite goes here'])
    expect(out.tokens).toEqual([
      { kind: 'text', text: 'hello {' },
      { kind: 'text', text: '{cite goes here' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('handles text + marker + text across many deltas', () => {
    const out = feed([
      'sentence one ',
      '{{cite:',
      UUID_1,
      '}}',
      ' and the rest ',
      `{{cite:${UUID_2}}}`,
      ' done.',
    ])
    expect(out.tokens).toEqual([
      { kind: 'text', text: 'sentence one ' },
      { kind: 'citation', chunkId: UUID_1 },
      { kind: 'text', text: ' and the rest ' },
      { kind: 'citation', chunkId: UUID_2 },
      { kind: 'text', text: ' done.' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('does not double-emit when reused across many empty deltas', () => {
    const out = feed(['{{cite:', '', UUID_3, '', '}}'])
    expect(out.tokens).toEqual([{ kind: 'citation', chunkId: UUID_3 }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })
})

describe('parseStream — malformed markers (unresolved)', () => {
  it('emits unresolved when the prefix is wrong', () => {
    const out = parseStream('{{notcite:abc}}', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: '{{notcite:abc}}' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits unresolved when the UUID is too short', () => {
    const out = parseStream('{{cite:abc-123}}', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: '{{cite:abc-123}}' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits unresolved when the UUID has invalid chars', () => {
    const malformed = '{{cite:GGGGGGGG-89ab-cdef-0123-456789abcdef}}'
    const out = parseStream(malformed, initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: malformed }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits unresolved when the UUID has a leading space', () => {
    const malformed = `{{ cite:${UUID_1}}}`
    const out = parseStream(malformed, initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: malformed }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits unresolved with empty content for `{{}}`', () => {
    const out = parseStream('{{}}', initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: '{{}}' }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('continues parsing the rest of the delta in text state after an unresolved', () => {
    const out = parseStream(`{{notcite:abc}} after {{cite:${UUID_1}}}`, initialParserState())
    expect(out.tokens).toEqual([
      { kind: 'unresolved', rawText: '{{notcite:abc}}' },
      { kind: 'text', text: ' after ' },
      { kind: 'citation', chunkId: UUID_1 },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('treats an inner `}}` as the closing pair (greedy first match)', () => {
    const out = parseStream('{{abc}}def}}', initialParserState())
    expect(out.tokens).toEqual([
      { kind: 'unresolved', rawText: '{{abc}}' },
      { kind: 'text', text: 'def}}' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })
})

describe('parseStream — buffer bailout', () => {
  it('exposes the documented bailout threshold', () => {
    expect(MARKER_BUFFER_BAILOUT_LENGTH).toBe(60)
  })

  it('emits unresolved when the buffer grows past the bailout without a closing `}}`', () => {
    const filler = 'x'.repeat(MARKER_BUFFER_BAILOUT_LENGTH + 1)
    const out = parseStream(`{{${filler}`, initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: `{{${filler}` }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('does not bail out for content within the bailout threshold', () => {
    const filler = 'x'.repeat(MARKER_BUFFER_BAILOUT_LENGTH)
    const out = parseStream(`{{${filler}`, initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({ kind: 'marker_pending', buffer: filler })
  })

  it('falls back to text state and processes remaining chars after bailout', () => {
    const filler = 'x'.repeat(MARKER_BUFFER_BAILOUT_LENGTH + 1)
    const trailing = '}}!'
    const out = parseStream(`{{${filler}${trailing}`, initialParserState())
    expect(out.tokens[0]).toEqual({ kind: 'unresolved', rawText: `{{${filler}` })
    expect(out.tokens[1]).toEqual({ kind: 'text', text: '}}!' })
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('prefers a real `}}` close over bailout when both could fire on the same char', () => {
    const inside = 'x'.repeat(MARKER_BUFFER_BAILOUT_LENGTH - 1)
    const out = parseStream(`{{${inside}}}`, initialParserState())
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: `{{${inside}}}` }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('bails out across delta boundaries when buffer cumulatively exceeds the limit', () => {
    const head = 'a'.repeat(40)
    const tail = 'b'.repeat(21)
    const out = feed([`{{${head}`, tail])
    expect(out.tokens).toEqual([{ kind: 'unresolved', rawText: `{{${head}${tail}` }])
    expect(out.nextState).toEqual({ kind: 'text' })
  })

  it('emits unresolved followed by text for chars after the bailout point across delta boundaries', () => {
    const head = 'a'.repeat(40)
    const tail = `${'b'.repeat(21)}c`
    const out = feed([`{{${head}`, tail])
    expect(out.tokens).toEqual([
      { kind: 'unresolved', rawText: `{{${head}${'b'.repeat(21)}` },
      { kind: 'text', text: 'c' },
    ])
    expect(out.nextState).toEqual({ kind: 'text' })
  })
})

describe('parseStream — end-of-stream behavior', () => {
  it('returns marker_pending state when the final delta ends mid-marker (caller flushes)', () => {
    const out = parseStream(`{{cite:${UUID_1}`, initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({
      kind: 'marker_pending',
      buffer: `cite:${UUID_1}`,
    })
  })

  it('returns marker_pending with single trailing `}` when delta ends after one brace', () => {
    const out = parseStream(`{{cite:${UUID_1}}`, initialParserState())
    expect(out.tokens).toEqual([])
    expect(out.nextState).toEqual({
      kind: 'marker_pending',
      buffer: `cite:${UUID_1}}`,
    })
  })

  it('lets the caller decide how to flush a dangling marker_pending state', () => {
    const partial = parseStream(`{{cite:${UUID_1}`, initialParserState())
    if (partial.nextState.kind === 'marker_pending') {
      const flushed: Token = {
        kind: 'unresolved',
        rawText: `{{${partial.nextState.buffer}`,
      }
      expect(flushed.rawText).toBe(`{{cite:${UUID_1}`)
    } else {
      throw new Error('expected marker_pending')
    }
  })
})

describe('parseStream — purity', () => {
  it('does not mutate the input state object', () => {
    const state: ParserState = { kind: 'marker_pending', buffer: 'cite:abc' }
    const snapshot = { ...state }
    parseStream('def', state)
    expect(state).toEqual(snapshot)
  })

  it('returns the same state instance for an empty delta', () => {
    const stateText: ParserState = { kind: 'text' }
    expect(parseStream('', stateText).nextState).toBe(stateText)

    const stateMarker: ParserState = { kind: 'marker_pending', buffer: 'x' }
    expect(parseStream('', stateMarker).nextState).toBe(stateMarker)
  })

  it('produces deterministic output for repeated calls', () => {
    const a = parseStream(`hello {{cite:${UUID_1}}} world`, initialParserState())
    const b = parseStream(`hello {{cite:${UUID_1}}} world`, initialParserState())
    expect(a).toEqual(b)
  })

  it('does not throw on adversarial inputs', () => {
    const adversarial = [
      '',
      '{',
      '}',
      '{{',
      '}}',
      '{{}}',
      '{{}}}}',
      '{}{}{}',
      '{{cite:}}',
      '{{cite:not-a-uuid}}',
      '{{ '.repeat(50),
      '}}'.repeat(50),
      '{{cite:01234567-89ab-cdef-0123-456789abcdef',
      `${UUID_1}}}`,
    ]
    for (const input of adversarial) {
      expect(() => parseStream(input, initialParserState())).not.toThrow()
      expect(() =>
        parseStream(input, { kind: 'marker_pending', buffer: 'cite:partial' }),
      ).not.toThrow()
    }
  })
})
