import type { ZodError } from 'zod'

const PROBLEM_TYPE_PREFIX = 'urn:dialogus:problems:'

export interface ProblemDetails {
  readonly type?: string
  readonly title?: string
  readonly status?: number
  readonly detail?: string
  readonly errors?: ReadonlyArray<{ field: string; message: string }>
}

export class ApiError extends Error {
  readonly status: number
  readonly slug: string | null
  readonly title: string | null
  readonly detail: string | null
  readonly problem: ProblemDetails | null

  constructor(
    status: number,
    options: {
      slug?: string | null
      title?: string | null
      detail?: string | null
      problem?: ProblemDetails | null
    } = {},
  ) {
    const message = options.detail ?? options.title ?? options.slug ?? `HTTP ${status}`
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.slug = options.slug ?? null
    this.title = options.title ?? null
    this.detail = options.detail ?? null
    this.problem = options.problem ?? null
  }
}

export class SchemaError extends Error {
  readonly cause: ZodError

  constructor(cause: ZodError, where: string) {
    super(`Schema validation failed at ${where}`)
    this.name = 'SchemaError'
    this.cause = cause
  }
}

export function slugFromProblemType(type: unknown): string | null {
  if (typeof type !== 'string') return null
  if (!type.startsWith(PROBLEM_TYPE_PREFIX)) return null
  const slug = type.slice(PROBLEM_TYPE_PREFIX.length)
  return slug.length > 0 ? slug : null
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.type === 'string' ||
    typeof candidate.title === 'string' ||
    typeof candidate.status === 'number'
  )
}
