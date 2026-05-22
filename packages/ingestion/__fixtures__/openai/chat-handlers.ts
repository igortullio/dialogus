import { HttpResponse, http } from 'msw'

export const OPENAI_CHAT_BASE_URL = 'https://api.openai.com/v1'
// AI SDK 3 routes Chat Completions to /chat/completions and Responses API
// to /responses. We point the generator at /chat/completions (gpt-4o-mini
// uses Chat Completions).
export const OPENAI_CHAT_COMPLETIONS_URL = `${OPENAI_CHAT_BASE_URL}/chat/completions`
export const OPENAI_RESPONSES_URL = `${OPENAI_CHAT_BASE_URL}/responses`

export interface OpenAIChatSuccessOptions {
  readonly text?: string
  readonly model?: string
  readonly promptTokens?: number
  readonly completionTokens?: number
}

export function buildOpenAIChatSuccessBody(
  options: OpenAIChatSuccessOptions = {},
): Record<string, unknown> {
  return {
    id: 'chatcmpl_test_01',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: options.model ?? 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: options.text ?? 'Test summary text returned by mocked OpenAI.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: options.promptTokens ?? 100,
      completion_tokens: options.completionTokens ?? 50,
      total_tokens: (options.promptTokens ?? 100) + (options.completionTokens ?? 50),
    },
  }
}

export function buildOpenAIResponsesSuccessBody(
  options: OpenAIChatSuccessOptions = {},
): Record<string, unknown> {
  return {
    id: 'resp_test_01',
    object: 'response',
    created_at: 1_700_000_000,
    model: options.model ?? 'gpt-4o-mini',
    output: [
      {
        id: 'msg_test_01',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: options.text ?? 'Test summary text returned by mocked OpenAI.',
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: options.promptTokens ?? 100,
      output_tokens: options.completionTokens ?? 50,
      total_tokens: (options.promptTokens ?? 100) + (options.completionTokens ?? 50),
    },
  }
}

export function openaiChat200Response(options: OpenAIChatSuccessOptions = {}) {
  return HttpResponse.json(buildOpenAIChatSuccessBody(options))
}

export function openaiResponses200Response(options: OpenAIChatSuccessOptions = {}) {
  return HttpResponse.json(buildOpenAIResponsesSuccessBody(options))
}

export function openaiChat429Response(retryAfterSeconds?: number) {
  const headers: Record<string, string> = {}
  if (retryAfterSeconds !== undefined) {
    headers['retry-after'] = String(retryAfterSeconds)
  }
  return HttpResponse.json(
    {
      error: { type: 'rate_limit_error', message: 'rate limit exceeded' },
    },
    { status: 429, headers },
  )
}

export function openaiResponses429Response(retryAfterSeconds?: number) {
  return openaiChat429Response(retryAfterSeconds)
}

export function openaiChat500Response() {
  return HttpResponse.json(
    {
      error: { type: 'api_error', message: 'internal server error' },
    },
    { status: 500 },
  )
}

export function openaiResponses500Response() {
  return openaiChat500Response()
}

export function makeOpenAIChat200Handler(
  options: OpenAIChatSuccessOptions = {},
): ReturnType<typeof http.post> {
  return http.post(OPENAI_CHAT_COMPLETIONS_URL, async () => openaiChat200Response(options))
}

export function makeOpenAIResponses200Handler(
  options: OpenAIChatSuccessOptions = {},
): ReturnType<typeof http.post> {
  return http.post(OPENAI_RESPONSES_URL, async () => openaiResponses200Response(options))
}

// AI SDK 3 may hit either /chat/completions or /responses depending on model
// + provider settings. Register both for resilient happy-path coverage.
export const happyPathHandlers = [makeOpenAIChat200Handler(), makeOpenAIResponses200Handler()]
