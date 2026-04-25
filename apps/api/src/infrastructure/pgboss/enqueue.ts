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

export async function enqueue<T>(deps: EnqueueDeps, queue: string, data: T): Promise<string> {
  const factory = deps.createBoss ?? createPgBoss
  const boss = factory(deps.databaseUrl)
  await boss.start()
  try {
    const jobId = await boss.send(queue, data as object)
    if (jobId == null) {
      throw new EnqueueError(queue, `pg-boss returned null jobId for queue "${queue}"`)
    }
    return jobId
  } finally {
    await boss.stop({ graceful: false })
  }
}
