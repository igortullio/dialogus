import { createPgBoss, type PgBoss } from '@dialogus/db'

export type CreateBoss = (connectionString: string) => PgBoss

export interface EnqueueDeps {
  databaseUrl: string
  createBoss?: CreateBoss
}

export class EnqueueError extends Error {
  readonly queue: string
  constructor(queue: string, message: string) {
    super(message)
    this.name = 'EnqueueError'
    this.queue = queue
  }
}

export interface EnqueueOptions {
  /**
   * Deterministic dedup key. pg-boss keeps at most one job per `singletonKey` in a
   * non-completed state, so a deterministic key (e.g. `ingest-{bookId}`) collapses
   * concurrent first-adds of the same book into exactly one ingestion job (FR-012).
   */
  singletonKey?: string
}

export async function enqueue<T>(
  deps: EnqueueDeps,
  queue: string,
  data: T,
  options?: EnqueueOptions,
): Promise<string> {
  const factory = deps.createBoss ?? createPgBoss
  const boss = factory(deps.databaseUrl)
  await boss.start()
  try {
    const jobId =
      options?.singletonKey !== undefined
        ? await boss.send(queue, data as object, { singletonKey: options.singletonKey })
        : await boss.send(queue, data as object)
    if (jobId == null) {
      throw new EnqueueError(queue, `pg-boss returned null jobId for queue "${queue}"`)
    }
    return jobId
  } finally {
    await boss.stop({ graceful: false })
  }
}
