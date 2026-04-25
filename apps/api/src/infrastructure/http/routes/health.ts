import type { Database } from '@dialogus/db'
import { probeDb, probePgBoss } from '@dialogus/db'
import { healthResponseSchema } from '@dialogus/shared/schemas/health'
import { Hono } from 'hono'

export interface HealthRouteDeps {
  db: Database
}

export function createHealthRoute(deps: HealthRouteDeps): Hono {
  const app = new Hono()

  app.get('/', async (c) => {
    const [dbUp, pgbossUp] = await Promise.all([probeDb(deps.db), probePgBoss(deps.db)])
    const body = healthResponseSchema.parse({
      api: 'up',
      db: dbUp ? 'up' : 'down',
      pgboss: pgbossUp ? 'up' : 'down',
    })
    return c.json(body, 200)
  })

  return app
}
