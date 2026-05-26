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
// XML prolog (`<?xml … ?>`), DOCTYPE, and comments are not covered by TAG
// (which requires a letter immediately after `<`/`</`). Without these, XHTML
// chapters from EPUBs leak the doctype boilerplate into stored chunk text.
const PROCESSING_INSTRUCTION = /<\?[\s\S]*?\?>/g
const DOCTYPE = /<![A-Za-z][\s\S]*?>/g
const COMMENT = /<!--[\s\S]*?-->/g
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

// Sentinel for explicit `<br>` line breaks while we collapse soft-wrap newlines
// inside paragraphs. Restored to `\n` after the collapse pass so meaningful
// breaks (poetry, addresses) survive without re-introducing source-text wraps.
const HARD_BREAK_PLACEHOLDER = ''

export function htmlToPlainText(html: string): string {
  if (html.length === 0) return ''
  const cleaned = html
    .replace(COMMENT, '')
    .replace(PROCESSING_INSTRUCTION, '')
    .replace(DOCTYPE, '')
    .replace(DROP_BLOCK, '')
    .replace(BREAK_TAG, HARD_BREAK_PLACEHOLDER)
    .replace(BLOCK_TAG, '\n')
    .replace(TAG, '')
  const decoded = decodeEntities(cleaned)
  return (
    decoded
      .replace(/\r\n?/g, '\n')
      // Many EPUBs hard-wrap text inside <p> at ~70 chars. Those source-text
      // newlines render as soft wraps in a real renderer but become literal \n
      // here. Collapse any single newline flanked by non-newline content into a
      // space; paragraph breaks (\n\n) and the <br> placeholder are untouched.
      .replace(/(?<!\n)\n(?!\n)/g, ' ')
      .replace(new RegExp(HARD_BREAK_PLACEHOLDER, 'g'), '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/[ \t\f\v]*\n[ \t\f\v]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
