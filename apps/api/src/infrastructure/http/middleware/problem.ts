import {
  BookNotFoundError,
  DuplicateBookError,
  GutendexUpstreamError,
  GutendexValidationError,
} from '@dialogus/catalog'
import {
  ConfigError,
  DialogusError,
  ForbiddenError,
  IdempotencyKeyConflictError,
  InvalidCursorError,
  UnauthorizedError,
  ValidationError,
} from '@dialogus/shared/errors'
import {
  type ProblemDetails,
  problemDetails,
  type ValidationIssue,
} from '@dialogus/shared/http/problem'
import type { MiddlewareHandler } from 'hono'
import type { Logger } from 'pino'
import { ZodError } from 'zod'

const PROBLEM_CONTENT_TYPE = 'application/problem+json'
const GENERIC_INTERNAL_DETAIL = 'unexpected error'

export const INGESTION_PROBLEM_SLUGS = {
  'book-not-in-discovered-state': 409,
  'book-not-in-retryable-state': 409,
  'book-already-ready': 409,
  'ingestion-download-failed': 503,
  'ingestion-parse-failed': 422,
  'ingestion-summarize-failed': 503,
  'ingestion-embed-failed': 503,
  'ingestion-concurrency-limit': 429,
  'chunk-not-found': 404,
} as const satisfies Record<string, number>

export type IngestionProblemSlug = keyof typeof INGESTION_PROBLEM_SLUGS

const INGESTION_PROBLEM_SLUGS_WITH_RETRY_AFTER: ReadonlySet<IngestionProblemSlug> = new Set([
  'ingestion-download-failed',
  'ingestion-summarize-failed',
  'ingestion-embed-failed',
  'ingestion-concurrency-limit',
])

const INGESTION_ERROR_CODE_TO_SLUG: Readonly<Record<string, IngestionProblemSlug>> = {
  BOOK_NOT_IN_DISCOVERED_STATE: 'book-not-in-discovered-state',
  BOOK_NOT_IN_RETRYABLE_STATE: 'book-not-in-retryable-state',
  BOOK_ALREADY_READY: 'book-already-ready',
  INGESTION_DOWNLOAD_FAILED: 'ingestion-download-failed',
  INGESTION_PARSE_FAILED: 'ingestion-parse-failed',
  INGESTION_SUMMARIZE_FAILED: 'ingestion-summarize-failed',
  INGESTION_EMBED_FAILED: 'ingestion-embed-failed',
  INGESTION_CONCURRENCY_LIMIT: 'ingestion-concurrency-limit',
  CHUNK_NOT_FOUND: 'chunk-not-found',
}

export interface ProblemMiddlewareDeps {
  logger: Logger
}

interface ProblemBody extends ProblemDetails {
  instance: string
  existing_book_id?: string
}

interface MappedError {
  body: ProblemBody
  status: number
  headers?: Record<string, string>
}

export interface ProblemVariables {
  traceId?: string
}

function zodIssuesToValidationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
  }))
}

function mapIngestionDialogusError(err: DialogusError, path: string): MappedError | null {
  const slug = INGESTION_ERROR_CODE_TO_SLUG[err.code]
  if (slug === undefined) return null
  const status = INGESTION_PROBLEM_SLUGS[slug]
  const mapped: MappedError = {
    body: { ...problemDetails(slug, status, err.message), instance: path },
    status,
  }
  if (INGESTION_PROBLEM_SLUGS_WITH_RETRY_AFTER.has(slug)) {
    mapped.headers = { 'retry-after': '60' }
  }
  return mapped
}

function mapAuthError(err: Error, path: string): MappedError | null {
  if (err instanceof UnauthorizedError) {
    return {
      body: { ...problemDetails('unauthorized', 401, err.message), instance: path },
      status: 401,
    }
  }
  if (err instanceof ForbiddenError) {
    return {
      body: { ...problemDetails('forbidden', 403, err.message), instance: path },
      status: 403,
    }
  }
  return null
}

// US3 admin/onboarding error codes (typed DialogusError) → problem slugs.
const ADMIN_ERROR_CODE_TO_SLUG: Readonly<Record<string, { slug: string; status: number }>> = {
  LAST_ADMIN: { slug: 'last-admin', status: 409 },
  INVITATION_INVALID: { slug: 'invitation-invalid', status: 410 },
  INVITATION_CONFLICT: { slug: 'invitation-conflict', status: 409 },
  MEMBER_NOT_FOUND: { slug: 'member-not-found', status: 404 },
}

function mapAdminError(err: DialogusError, path: string): MappedError | null {
  const mapping = ADMIN_ERROR_CODE_TO_SLUG[err.code]
  if (mapping === undefined) return null
  return {
    body: { ...problemDetails(mapping.slug, mapping.status, err.message), instance: path },
    status: mapping.status,
  }
}

/** Maps typed `DialogusError` codes (admin + ingestion families) to problem slugs. */
function mapDialogusError(err: DialogusError, path: string): MappedError | null {
  return mapAdminError(err, path) ?? mapIngestionDialogusError(err, path)
}

function mapError(err: Error, path: string): MappedError {
  if (err instanceof DuplicateBookError) {
    const body: ProblemBody = {
      ...problemDetails('duplicate-gutendex-id', 409, err.message),
      instance: path,
    }
    if (err.existingBookId !== null) body.existing_book_id = err.existingBookId
    return { body, status: 409 }
  }

  if (err instanceof BookNotFoundError) {
    return {
      body: { ...problemDetails('book-not-found', 404, err.message), instance: path },
      status: 404,
    }
  }

  const authMapped = mapAuthError(err, path)
  if (authMapped !== null) return authMapped

  if (err instanceof GutendexUpstreamError) {
    return {
      body: { ...problemDetails('gutendex-upstream-error', 503, err.message), instance: path },
      status: 503,
      headers: { 'retry-after': '60' },
    }
  }

  if (err instanceof GutendexValidationError) {
    const issues = err.issues.map((issue) => ({ field: issue.path, message: issue.message }))
    return {
      body: {
        ...problemDetails('gutendex-validation-failed', 503, err.message, issues),
        instance: path,
      },
      status: 503,
    }
  }

  if (err instanceof InvalidCursorError) {
    return {
      body: { ...problemDetails('invalid-cursor', 400, err.message), instance: path },
      status: 400,
    }
  }

  if (err instanceof IdempotencyKeyConflictError) {
    return {
      body: { ...problemDetails('idempotency-key-conflict', 422, err.message), instance: path },
      status: 422,
    }
  }

  if (err instanceof ZodError) {
    const issues = zodIssuesToValidationIssues(err)
    return {
      body: {
        ...problemDetails('validation-failed', 400, 'Request validation failed', issues),
        instance: path,
      },
      status: 400,
    }
  }

  if (err instanceof ValidationError) {
    return {
      body: { ...problemDetails('validation-failed', 400, err.message), instance: path },
      status: 400,
    }
  }

  if (err instanceof ConfigError) {
    return {
      body: { ...problemDetails('internal-error', 500, GENERIC_INTERNAL_DETAIL), instance: path },
      status: 500,
    }
  }

  if (err instanceof DialogusError) {
    const mapped = mapDialogusError(err, path)
    if (mapped !== null) return mapped
  }

  return {
    body: { ...problemDetails('internal-error', 500, GENERIC_INTERNAL_DETAIL), instance: path },
    status: 500,
  }
}

export function createProblemMiddleware(
  deps: ProblemMiddlewareDeps,
): MiddlewareHandler<{ Variables: ProblemVariables }> {
  return async (c, next) => {
    await next()

    const err = c.error
    if (!(err instanceof Error)) return

    const path = c.req.path
    const mapped = mapError(err, path)
    const errorCode = err instanceof DialogusError ? err.code : null
    const traceId = c.get('traceId') ?? c.req.header('x-trace-id')

    const logFields = {
      trace_id: traceId,
      error_code: errorCode,
      error_name: err.name,
      status: mapped.status,
      path,
    }

    if (mapped.status >= 500) {
      deps.logger.error({ ...logFields, error: err }, 'request failed')
    } else {
      deps.logger.warn(logFields, 'request failed')
    }

    const headers: Record<string, string> = {
      'content-type': PROBLEM_CONTENT_TYPE,
      ...(mapped.headers ?? {}),
    }

    c.res = new Response(JSON.stringify(mapped.body), {
      status: mapped.status,
      headers,
    })
    c.error = undefined
  }
}
