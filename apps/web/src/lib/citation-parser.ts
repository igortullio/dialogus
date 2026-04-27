import { CITATION_MARKER_REGEX } from '@dialogus/rag'

export type ParserState = { kind: 'text' } | { kind: 'marker_pending'; buffer: string }

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; chunkId: string }
  | { kind: 'unresolved'; rawText: string }

export const MARKER_BUFFER_BAILOUT_LENGTH = 60

const ANCHORED_CITATION_REGEX = new RegExp(`^${CITATION_MARKER_REGEX.source}$`)

export function initialParserState(): ParserState {
  return { kind: 'text' }
}

interface MutableState {
  tokens: Token[]
  textBuffer: string
  markerBuffer: string
  inMarker: boolean
}

function flushTextBuffer(s: MutableState): void {
  if (s.textBuffer.length > 0) {
    s.tokens.push({ kind: 'text', text: s.textBuffer })
    s.textBuffer = ''
  }
}

function closeMarker(s: MutableState): void {
  const fullMarker = `{{${s.markerBuffer}`
  const match = ANCHORED_CITATION_REGEX.exec(fullMarker)
  const chunkId = match?.[1]
  if (chunkId !== undefined) {
    s.tokens.push({ kind: 'citation', chunkId })
  } else {
    s.tokens.push({ kind: 'unresolved', rawText: fullMarker })
  }
  s.inMarker = false
  s.markerBuffer = ''
}

function bailoutMarker(s: MutableState): void {
  s.tokens.push({ kind: 'unresolved', rawText: `{{${s.markerBuffer}` })
  s.inMarker = false
  s.markerBuffer = ''
}

function stepText(s: MutableState, deltaText: string, i: number): number {
  const c = deltaText[i]
  if (c === '{' && deltaText[i + 1] === '{') {
    flushTextBuffer(s)
    s.inMarker = true
    s.markerBuffer = ''
    return i + 2
  }
  s.textBuffer += c
  return i + 1
}

function stepMarker(s: MutableState, deltaText: string, i: number): number {
  s.markerBuffer += deltaText[i]
  if (s.markerBuffer.length >= 2 && s.markerBuffer.endsWith('}}')) {
    closeMarker(s)
  } else if (s.markerBuffer.length > MARKER_BUFFER_BAILOUT_LENGTH) {
    bailoutMarker(s)
  }
  return i + 1
}

export function parseStream(
  deltaText: string,
  state: ParserState,
): { tokens: Token[]; nextState: ParserState } {
  if (deltaText.length === 0) {
    return { tokens: [], nextState: state }
  }

  const s: MutableState = {
    tokens: [],
    textBuffer: '',
    markerBuffer: state.kind === 'marker_pending' ? state.buffer : '',
    inMarker: state.kind === 'marker_pending',
  }

  let i = 0
  while (i < deltaText.length) {
    i = s.inMarker ? stepMarker(s, deltaText, i) : stepText(s, deltaText, i)
  }

  if (s.inMarker) {
    return { tokens: s.tokens, nextState: { kind: 'marker_pending', buffer: s.markerBuffer } }
  }
  flushTextBuffer(s)
  return { tokens: s.tokens, nextState: { kind: 'text' } }
}
