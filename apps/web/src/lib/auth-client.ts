import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

const DEFAULT_API_BASE = 'http://localhost:3001'

/**
 * Better Auth browser client. Points at the Hono API origin where
 * `/api/auth/*` is mounted; the client appends the `/api/auth` base path.
 * The `adminClient` plugin mirrors the server admin plugin (roles, ban/revoke).
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE,
  plugins: [adminClient()],
})

export const { signIn, signOut, signUp, useSession, getSession } = authClient
