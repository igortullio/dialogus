import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpResponse, http } from 'msw'

const here = dirname(fileURLToPath(import.meta.url))

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_EMBEDDINGS_URL = `${OPENAI_BASE_URL}/embeddings`

export const EMBED_200_FIXTURE_PATH = join(here, 'embed-200.json')
export const EMBED_429_FIXTURE_PATH = join(here, 'embed-429.json')

interface OpenAIEmbeddingsRequestBody {
  readonly input: string | string[]
  readonly model: string
  readonly encoding_format?: string
}

interface OpenAIEmbeddingsFixture {
  readonly object: string
  readonly data: ReadonlyArray<{
    readonly object: string
    readonly embedding: number[]
    readonly index: number
  }>
  readonly model: string
  readonly usage: { readonly prompt_tokens: number; readonly total_tokens: number }
}

let cachedSuccessFixture: OpenAIEmbeddingsFixture | null = null
let cachedErrorFixture: unknown = null

async function loadSuccessFixture(): Promise<OpenAIEmbeddingsFixture> {
  if (!cachedSuccessFixture) {
    const raw = await readFile(EMBED_200_FIXTURE_PATH, 'utf8')
    cachedSuccessFixture = JSON.parse(raw) as OpenAIEmbeddingsFixture
  }
  return cachedSuccessFixture
}

async function loadErrorFixture(): Promise<unknown> {
  if (!cachedErrorFixture) {
    const raw = await readFile(EMBED_429_FIXTURE_PATH, 'utf8')
    cachedErrorFixture = JSON.parse(raw)
  }
  return cachedErrorFixture
}

function inputsFrom(body: OpenAIEmbeddingsRequestBody): string[] {
  return Array.isArray(body.input) ? [...body.input] : [body.input]
}

export async function embed200Response(request: Request) {
  const fixture = await loadSuccessFixture()
  const body = (await request.json()) as OpenAIEmbeddingsRequestBody
  const inputs = inputsFrom(body)
  const baseEmbedding = fixture.data[0]?.embedding ?? []
  const data = inputs.map((_, index) => ({
    object: 'embedding',
    embedding: baseEmbedding,
    index,
  }))
  return HttpResponse.json({
    object: 'list',
    data,
    model: body.model ?? fixture.model,
    usage: fixture.usage,
  })
}

export function makeEmbed200Handler(): ReturnType<typeof http.post> {
  return http.post(OPENAI_EMBEDDINGS_URL, async ({ request }) => embed200Response(request))
}

export async function embed429Response() {
  const fixture = (await loadErrorFixture()) as Record<string, unknown>
  return HttpResponse.json(fixture, { status: 429 })
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

export const happyPathHandlers = [makeEmbed200Handler()]
