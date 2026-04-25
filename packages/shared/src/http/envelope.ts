export interface Envelope<T> {
  data: T
  meta?: Record<string, unknown>
  links?: Record<string, string>
}

export interface EnvelopeOptions {
  meta?: Record<string, unknown>
  links?: Record<string, string>
}

export function envelope<T>(data: T, opts?: EnvelopeOptions): Envelope<T> {
  const result: Envelope<T> = { data }
  if (opts?.meta !== undefined) result.meta = opts.meta
  if (opts?.links !== undefined) result.links = opts.links
  return result
}
