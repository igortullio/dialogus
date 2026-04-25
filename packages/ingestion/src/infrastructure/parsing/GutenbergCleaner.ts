// Project Gutenberg framing markers vary slightly across decades of dumps:
//   *** START OF THE PROJECT GUTENBERG EBOOK <TITLE> ***
//   *** START OF THIS PROJECT GUTENBERG EBOOK <TITLE> ***
//   *** START OF PROJECT GUTENBERG EBOOK <TITLE> ***
// We accept all three; everything before the start marker (license preamble,
// transcription notes) and after the end marker (license tail, donations
// boilerplate) is dropped.
const START_MARKER = /\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i
const END_MARKER = /\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i

// Keep at most two consecutive blank lines (i.e. three newlines back-to-back).
const EXCESS_BLANK_LINES = /\n{4,}/g

export function clean(rawText: string): string {
  let text = rawText

  const startMatch = START_MARKER.exec(text)
  if (startMatch && startMatch.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length)
  }

  const endMatch = END_MARKER.exec(text)
  if (endMatch && endMatch.index !== undefined) {
    text = text.slice(0, endMatch.index)
  }

  text = text.replace(EXCESS_BLANK_LINES, '\n\n\n')
  return text.trim()
}

export const GutenbergCleaner = { clean }
