import { describe, expect, it } from 'vitest'
import { htmlToPlainText } from '../../../src/infrastructure/parsing/html-to-text'

describe('htmlToPlainText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToPlainText('')).toBe('')
  })

  it('strips block-level tags into paragraph-separated text', () => {
    const input = '<h1>Title</h1><p>Para one.</p><p>Para two.</p>'
    expect(htmlToPlainText(input)).toBe('Title\n\nPara one.\n\nPara two.')
  })

  it('replaces <br> tags with newlines', () => {
    expect(htmlToPlainText('Line one<br/>Line two<br>Line three')).toBe(
      'Line one\nLine two\nLine three',
    )
  })

  it('drops head, script, style, svg, and template blocks', () => {
    const input =
      '<head><title>x</title></head><script>doit();</script><style>a{}</style><p>Body</p>'
    expect(htmlToPlainText(input)).toBe('Body')
  })

  it('decodes the supported named html entities and leaves others intact', () => {
    const input = '<p>It&apos;s &amp; cookies&hellip; &mdash;done</p>'
    expect(htmlToPlainText(input)).toBe("It's & cookies… —done")
  })

  it('decodes numeric and hex html entities', () => {
    expect(htmlToPlainText('<p>A&#65;A&#x42;B</p>')).toBe('AAABB')
  })

  it('drops malformed numeric entities silently', () => {
    expect(htmlToPlainText('<p>Bad&#0;ok</p>')).toBe('Badok')
  })

  it('keeps unknown named entities verbatim', () => {
    expect(htmlToPlainText('<p>&unknownentity;</p>')).toBe('&unknownentity;')
  })

  it('collapses soft-wrap newlines inside a paragraph but preserves <br>', () => {
    const input =
      '<p>The night-light\ncontinued to burn on the chimney-piece, exhausting the last drops\nof oil which floated</p>' +
      '<p>Line one<br/>Line two</p>'
    expect(htmlToPlainText(input)).toBe(
      'The night-light continued to burn on the chimney-piece, exhausting the last drops of oil which floated\n\nLine one\nLine two',
    )
  })

  it('strips XML prolog, DOCTYPE, and comments from XHTML EPUB chapters', () => {
    const input = [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.1//EN' 'http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd'>",
      '<!-- a comment -->',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter body.</p></body></html>',
    ].join('\n')
    expect(htmlToPlainText(input)).toBe('Chapter body.')
  })
})
