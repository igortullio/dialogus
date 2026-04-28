import { describe, expect, it } from 'vitest'
import { _internals } from '../../src/test-mocks/anthropic-msw'

const { findToolResult, findUserText, deriveResponseText } = _internals

describe('anthropic-msw helpers', () => {
  it('findUserText pulls plain string content first', () => {
    const text = findUserText({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'system', content: 'you are an agent' },
        { role: 'user', content: 'quem é o narrador?' },
      ],
    })
    expect(text).toBe('quem é o narrador?')
  })

  it('findUserText supports content blocks with text type', () => {
    const text = findUserText({
      model: 'claude-haiku-4-5',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'olá mundo' }],
        },
      ],
    })
    expect(text).toBe('olá mundo')
  })

  it('findToolResult returns null when no tool_result blocks are present', () => {
    expect(
      findToolResult({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).toBeNull()
  })

  it('findToolResult parses the JSON tool_result payload', () => {
    const result = findToolResult({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'user', content: 'pergunta' },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              content: [
                {
                  text: '{"chunks":[{"chunk_id":"abc","chapter_ordinal":3}]}',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(result?.chunks?.[0]?.chunk_id).toBe('abc')
    expect(result?.chunks?.[0]?.chapter_ordinal).toBe(3)
  })

  it('deriveResponseText returns the refusal template when no chunks come back', () => {
    const text = deriveResponseText({ chunks: [] })
    expect(text).toContain('Não encontrei passagens relevantes')
    expect(text).not.toMatch(/\{\{cite:/)
  })

  it('deriveResponseText embeds the citation marker for the first chunk_id', () => {
    const text = deriveResponseText({
      chunks: [{ chunk_id: 'chunk-uuid-1', chapter_ordinal: 5 }],
    })
    expect(text).toContain('{{cite:chunk-uuid-1}}')
    expect(text).toContain('capítulo 5')
  })
})
