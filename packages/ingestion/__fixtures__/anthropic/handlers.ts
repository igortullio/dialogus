import { HttpResponse, http } from 'msw'

export const ANTHROPIC_BASE_URL = 'http://anthropic.test/v1'
export const ANTHROPIC_MESSAGES_URL = `${ANTHROPIC_BASE_URL}/messages`

export interface AnthropicSuccessOptions {
  readonly text?: string
  readonly model?: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadInputTokens?: number
  readonly cacheCreationInputTokens?: number
}

export function buildAnthropicSuccessBody(
  options: AnthropicSuccessOptions = {},
): Record<string, unknown> {
  return {
    id: 'msg_test_01',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: options.text ?? 'Test summary text returned by mocked Anthropic.',
      },
    ],
    model: options.model ?? 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: options.inputTokens ?? 100,
      output_tokens: options.outputTokens ?? 50,
      cache_creation_input_tokens: options.cacheCreationInputTokens ?? 0,
      cache_read_input_tokens: options.cacheReadInputTokens ?? 0,
    },
  }
}

export function anthropic200Response(options: AnthropicSuccessOptions = {}) {
  return HttpResponse.json(buildAnthropicSuccessBody(options))
}

export function anthropic429Response() {
  return HttpResponse.json(
    {
      type: 'error',
      error: { type: 'rate_limit_error', message: 'rate limit exceeded' },
    },
    { status: 429 },
  )
}

export function anthropic500Response() {
  return HttpResponse.json(
    {
      type: 'error',
      error: { type: 'api_error', message: 'internal server error' },
    },
    { status: 500 },
  )
}

export function makeAnthropic200Handler(
  options: AnthropicSuccessOptions = {},
): ReturnType<typeof http.post> {
  return http.post(ANTHROPIC_MESSAGES_URL, async () => anthropic200Response(options))
}

export const happyPathHandlers = [makeAnthropic200Handler()]
