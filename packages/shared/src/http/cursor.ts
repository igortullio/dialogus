import { z } from 'zod'
import { InvalidCursorError } from '../errors/index.js'

export interface CursorPosition {
  createdAt: Date
  id: string
}

export const cursorPayloadSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
})

export function encodeCursor(position: CursorPosition): string {
  const payload = JSON.stringify({
    createdAt: position.createdAt.toISOString(),
    id: position.id,
  })
  return Buffer.from(payload, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = cursorPayloadSchema.parse(JSON.parse(raw))
    return { createdAt: new Date(parsed.createdAt), id: parsed.id }
  } catch (cause) {
    throw new InvalidCursorError(cursor, cause)
  }
}
