import { InvalidCursorError } from '@dialogus/shared/errors'

export function encodeCatalogCursor(nextUrl: string): string {
  return Buffer.from(nextUrl, 'utf8').toString('base64url')
}

export function decodeCatalogCursor(cursor: string): URL {
  let decoded: string
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch (cause) {
    throw new InvalidCursorError(cursor, cause)
  }
  if (decoded.length === 0) throw new InvalidCursorError(cursor)
  try {
    return new URL(decoded)
  } catch (cause) {
    throw new InvalidCursorError(cursor, cause)
  }
}
