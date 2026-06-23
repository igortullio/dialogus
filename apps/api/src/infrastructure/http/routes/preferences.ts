import type { LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { UnauthorizedError } from '@dialogus/shared/errors'
import { envelope } from '@dialogus/shared/http/envelope'
import {
  setSpoilerCapRequestSchema,
  spoilerCapBookIdParamSchema,
  spoilerCapsQuerySchema,
} from '@dialogus/shared/schemas/preferences'
import { type Context, Hono } from 'hono'
import {
  getSpoilerCaps,
  type SpoilerCapsDeps,
  setSpoilerCap,
} from '../../../application/preferences/spoilerCaps'
import type { Auth } from '../../auth/auth'
import { type AuthVariables, createSessionMiddleware, requireAuth } from '../middleware/auth'

export interface PreferencesRouteDeps {
  readonly db: Database
  readonly auth: Auth
  readonly libraryRepo: LibraryEntryRepository
}

function userIdOf(c: Context<{ Variables: AuthVariables }>): string {
  const userId = c.get('userId')
  if (userId === null) throw new UnauthorizedError()
  return userId
}

export function createPreferencesRoute(deps: PreferencesRouteDeps): Hono {
  const app = new Hono<{ Variables: AuthVariables }>()

  app.use('*', createSessionMiddleware(deps.auth))
  app.use('*', requireAuth())

  const svcDeps: SpoilerCapsDeps = { db: deps.db, libraryRepo: deps.libraryRepo }

  app.get('/spoiler-caps', async (c) => {
    const userId = userIdOf(c)
    const { book_ids } = spoilerCapsQuerySchema.parse(c.req.query())
    const caps = await getSpoilerCaps(svcDeps, userId, book_ids)
    return c.json(envelope({ caps }), 200)
  })

  app.put('/spoiler-caps/:bookId', async (c) => {
    const userId = userIdOf(c)
    const { bookId } = spoilerCapBookIdParamSchema.parse(c.req.param())
    const { spoiler_cap_chapter } = setSpoilerCapRequestSchema.parse(await c.req.json())
    const result = await setSpoilerCap(svcDeps, userId, bookId, spoiler_cap_chapter)
    return c.json(
      envelope({ book_id: result.bookId, spoiler_cap_chapter: result.spoilerCapChapter }),
      200,
    )
  })

  return app as unknown as Hono
}
