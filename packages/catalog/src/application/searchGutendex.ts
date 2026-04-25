import type { GutendexClient, GutendexSearchQuery } from '../domain/book/GutendexClient.port'
import { type RemoteBook, toBookFromGutendex } from './mappers/toBookFromGutendex'

export interface SearchGutendexDeps {
  client: GutendexClient
}

export interface SearchGutendexResult {
  books: RemoteBook[]
  nextPage: string | null
  count: number
}

export async function searchGutendex(
  deps: SearchGutendexDeps,
  query: GutendexSearchQuery,
): Promise<SearchGutendexResult> {
  const result = await deps.client.search(query)
  return {
    books: result.books.map(toBookFromGutendex),
    nextPage: result.nextPage,
    count: result.count,
  }
}
