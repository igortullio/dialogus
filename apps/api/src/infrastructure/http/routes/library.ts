import type { Database } from '@dialogus/db'
import { envelope } from '@dialogus/shared/http/envelope'
import {
  chunkReadDtoSchema,
  ingestionEnqueueResponseDtoSchema,
  ingestionStatusDtoSchema,
} from '@dialogus/shared/schemas/ingestion'
import { Hono } from 'hono'
import type { Logger } from 'pino'
import { z } from 'zod'
import { type GetChunkDeps, getChunk } from '../../../application/library/getChunk'
import {
  type GetIngestionStatusDeps,
  getIngestionStatus,
} from '../../../application/library/getIngestionStatus'
import { type IngestBookDeps, ingestBook } from '../../../application/library/ingest'
import { type RetryIngestBookDeps, retryIngestBook } from '../../../application/library/retryIngest'
import type { EnqueueDeps, enqueue } from '../../pgboss/enqueue'
import { idempotency } from '../middleware/idempotency'

export interface LibraryRouteDeps {
  readonly db: Database
  readonly logger?: Logger
  readonly enqueueDeps: EnqueueDeps
  readonly enqueueImpl?: typeof enqueue
}

const idParamSchema = z.object({ id: z.uuid() })

export function createLibraryRoute(deps: LibraryRouteDeps): Hono {
  const app = new Hono()

  const ingestDeps: IngestBookDeps = {
    db: deps.db,
    enqueueDeps: deps.enqueueDeps,
    ...(deps.enqueueImpl ? { enqueueImpl: deps.enqueueImpl } : {}),
  }
  const retryDeps: RetryIngestBookDeps = ingestDeps
  const statusDeps: GetIngestionStatusDeps = { db: deps.db }
  const chunkDeps: GetChunkDeps = { db: deps.db }

  const idempotencyMiddleware = idempotency({
    db: deps.db,
    ...(deps.logger ? { logger: deps.logger } : {}),
  })

  app.post('/books/:id/ingest', idempotencyMiddleware, async (c) => {
    const { id } = idParamSchema.parse(c.req.param())
    const result = await ingestBook(ingestDeps, id)
    return c.json(envelope(ingestionEnqueueResponseDtoSchema.parse(result)), 202)
  })

  app.post('/books/:id/ingest/retry', idempotencyMiddleware, async (c) => {
    const { id } = idParamSchema.parse(c.req.param())
    const result = await retryIngestBook(retryDeps, id)
    return c.json(envelope(ingestionEnqueueResponseDtoSchema.parse(result)), 202)
  })

  app.get('/books/:id/ingestion', async (c) => {
    const { id } = idParamSchema.parse(c.req.param())
    const result = await getIngestionStatus(statusDeps, id)
    return c.json(envelope(ingestionStatusDtoSchema.parse(result)), 200)
  })

  app.get('/chunks/:id', async (c) => {
    const { id } = idParamSchema.parse(c.req.param())
    const result = await getChunk(chunkDeps, id)
    return c.json(envelope(chunkReadDtoSchema.parse(result)), 200)
  })

  return app
}
