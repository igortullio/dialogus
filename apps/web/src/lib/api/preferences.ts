import { spoilerCapDataSchema, spoilerCapsDataSchema } from '@dialogus/shared/schemas/preferences'
import { apiBaseUrl, fetchEnvelope } from './_envelope'

const PREFERENCES_BASE = '/api/preferences'

/** Account-scoped spoiler caps for the given books. `null` = no cap. */
export async function fetchSpoilerCaps(
  bookIds: readonly string[],
): Promise<Record<string, number | null>> {
  if (bookIds.length === 0) return {}
  const envelope = await fetchEnvelope(apiBaseUrl(), `${PREFERENCES_BASE}/spoiler-caps`, {
    schema: spoilerCapsDataSchema,
    where: 'fetchSpoilerCaps',
    query: { book_ids: bookIds.join(',') },
  })
  return envelope.data.caps
}

/** Upsert the user's spoiler cap for one book; `null` clears it. */
export async function updateSpoilerCap(bookId: string, cap: number | null): Promise<number | null> {
  const envelope = await fetchEnvelope(apiBaseUrl(), `${PREFERENCES_BASE}/spoiler-caps/${bookId}`, {
    method: 'PUT',
    body: { spoiler_cap_chapter: cap },
    schema: spoilerCapDataSchema,
    where: 'updateSpoilerCap',
  })
  return envelope.data.spoiler_cap_chapter
}
