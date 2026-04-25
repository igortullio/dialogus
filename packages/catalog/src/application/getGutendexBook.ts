import type { GutendexClient } from '../domain/book/GutendexClient.port'
import { type RemoteBook, toBookFromGutendex } from './mappers/toBookFromGutendex'

export interface GetGutendexBookDeps {
  client: GutendexClient
}

export async function getGutendexBook(
  deps: GetGutendexBookDeps,
  gutendexId: number,
): Promise<RemoteBook> {
  const dto = await deps.client.getBook(gutendexId)
  return toBookFromGutendex(dto)
}
