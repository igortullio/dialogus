import { type ChunkReadDto, chunkReadDtoSchema } from '@dialogus/shared/schemas/ingestion'
import { apiBaseUrl, fetchEnvelope } from './_envelope'

const LIBRARY_BASE = '/api/library'

export async function fetchChunkById(id: string): Promise<ChunkReadDto> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${LIBRARY_BASE}/chunks/${id}`, {
    schema: chunkReadDtoSchema,
    where: 'fetchChunkById',
  })
  return envelope.data
}
