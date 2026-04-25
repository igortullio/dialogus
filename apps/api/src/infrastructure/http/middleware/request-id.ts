import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

const TRACE_HEADER = 'x-trace-id'

export interface RequestIdVariables {
  traceId: string
}

export function requestId(): MiddlewareHandler<{ Variables: RequestIdVariables }> {
  return async (c, next) => {
    const incoming = c.req.header(TRACE_HEADER)
    const traceId = incoming && incoming.length > 0 ? incoming : randomUUID()
    c.set('traceId', traceId)
    c.header(TRACE_HEADER, traceId)
    await next()
  }
}
