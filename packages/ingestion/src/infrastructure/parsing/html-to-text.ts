const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

const BLOCK_TAG =
  /<\/?(p|div|section|article|header|footer|aside|main|nav|li|tr|td|th|h[1-6]|blockquote|pre|figure|figcaption)(\s[^>]*)?>/gi
const BREAK_TAG = /<br(\s[^>]*)?\/?>/gi
const DROP_BLOCK = /<(head|script|style|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi
const TAG = /<\/?[a-zA-Z][^>]*>/g
const NUMERIC_ENTITY = /&#(x?)([0-9a-fA-F]+);/g
const NAMED_ENTITY = /&([a-zA-Z][a-zA-Z0-9]+);/g

function decodeEntities(input: string): string {
  return input
    .replace(NUMERIC_ENTITY, (_, hex: string, value: string) => {
      const codePoint = Number.parseInt(value, hex ? 16 : 10)
      if (!Number.isFinite(codePoint) || codePoint <= 0) return ''
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return ''
      }
    })
    .replace(NAMED_ENTITY, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
}

export function htmlToPlainText(html: string): string {
  if (html.length === 0) return ''
  const cleaned = html
    .replace(DROP_BLOCK, '')
    .replace(BREAK_TAG, '\n')
    .replace(BLOCK_TAG, '\n')
    .replace(TAG, '')
  const decoded = decodeEntities(cleaned)
  return decoded
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t\f\v]*\n[ \t\f\v]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
