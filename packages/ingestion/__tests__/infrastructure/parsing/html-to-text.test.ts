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
})
