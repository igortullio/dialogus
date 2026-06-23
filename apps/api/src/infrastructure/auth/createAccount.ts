import type { Auth } from './auth'

export interface CreateMemberAccountInput {
  readonly email: string
  readonly name: string
  readonly password: string
}

/**
 * Server-side account provisioning for the accept-invite flow. Mirrors the
 * owner seed (`internalAdapter.createUser` + `createAccount`) but for a member:
 * because `/sign-up/email` is disabled, invited users are created here. The
 * `user.create` allowlist hooks run inside `createUser`, so the open invitation
 * is re-validated and consumed (pending → used) as a side effect.
 */
export async function createMemberAccount(
  auth: Auth,
  input: CreateMemberAccountInput,
): Promise<{ id: string }> {
  const ctx = await auth.$context
  const email = input.email.trim().toLowerCase()
  const hashedPassword = await ctx.password.hash(input.password)
  const created = await ctx.internalAdapter.createUser({
    email,
    name: input.name,
    emailVerified: true,
  })
  await ctx.internalAdapter.createAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: hashedPassword,
  })
  return { id: created.id }
}
