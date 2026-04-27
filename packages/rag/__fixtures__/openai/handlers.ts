import { HttpResponse, http } from 'msw'

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_EMBEDDINGS_URL = `${OPENAI_BASE_URL}/embeddings`

interface OpenAIEmbeddingsRequestBody {
  readonly input: string | string[]
  readonly model: string
  readonly encoding_format?: string
}

export const FIXTURE_EMBEDDING: number[] = Array.from({ length: 1536 }, (_, i) => {
  const x = Math.sin(i + 1) // deterministic, non-zero, in [-1, 1]
  return Number(x.toFixed(6))
})

function inputsFrom(body: OpenAIEmbeddingsRequestBody): string[] {
  return Array.isArray(body.input) ? [...body.input] : [body.input]
}

export async function embed200Response(request: Request) {
  const body = (await request.json()) as OpenAIEmbeddingsRequestBody
  const inputs = inputsFrom(body)
  const data = inputs.map((_, index) => ({
    object: 'embedding',
    embedding: FIXTURE_EMBEDDING,
    index,
  }))
  return HttpResponse.json({
    object: 'list',
    data,
    model: body.model,
    usage: { prompt_tokens: 1, total_tokens: 1 },
  })
}

export function embed429Response() {
  return HttpResponse.json(
    {
      error: {
        message: 'Rate limit exceeded.',
        type: 'rate_limit_exceeded',
        param: null,
        code: 'rate_limit_exceeded',
      },
    },
    { status: 429 },
  )
}

export function embed500Response() {
  return HttpResponse.json(
    {
      error: {
        message: 'The server had an error while processing your request.',
        type: 'server_error',
        param: null,
        code: null,
      },
    },
    { status: 500 },
  )
}

export function makeEmbed200Handler(): ReturnType<typeof http.post> {
  return http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => embed200Response(request))
}

export const happyPathHandlers = [makeEmbed200Handler()]
