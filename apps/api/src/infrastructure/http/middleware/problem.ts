import { BookNotFoundError, DuplicateBookError, GutendexUpstreamError } from '@dialogus/catalog'
import {
  ConfigError,
  DialogusError,
  InvalidCursorError,
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

  if (err instanceof GutendexUpstreamError) {
    return {
      body: { ...problemDetails('gutendex-upstream-error', 503, err.message), instance: path },
      status: 503,
      headers: { 'retry-after': '60' },
    }
  }

  if (err instanceof InvalidCursorError) {
    return {
      body: { ...problemDetails('invalid-cursor', 400, err.message), instance: path },
      status: 400,
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
