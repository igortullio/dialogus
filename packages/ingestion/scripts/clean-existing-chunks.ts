// One-shot cleanup for `chunks.text` rows ingested before the XHTML cleanup
// fix landed. Re-applies the current `htmlToPlainText` to every chunk so
// stale XML prolog / DOCTYPE boilerplate and soft-wrap newlines are removed
// in place. Idempotent: running again on already-clean text is a no-op.
//
// Usage:
//   pnpm --filter @dialogus/ingestion run clean:chunks
// or:
//   DATABASE_URL=... pnpm exec tsx packages/ingestion/scripts/clean-existing-chunks.ts

import { createDatabase } from '@dialogus/db/client'
import { chunks } from '@dialogus/db/schema'
import { eq } from 'drizzle-orm'
import { htmlToPlainText } from '../src/infrastructure/parsing/html-to-text'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  const db = createDatabase(url)
  const rows = await db.select({ id: chunks.id, text: chunks.text }).from(chunks)
  console.log(`scanning ${rows.length} chunks`)

  let changed = 0
  let unchanged = 0
  for (const row of rows) {
    const cleaned = htmlToPlainText(row.text)
    if (cleaned === row.text) {
      unchanged += 1
      continue
    }
    await db.update(chunks).set({ text: cleaned }).where(eq(chunks.id, row.id))
    changed += 1
    if (changed % 100 === 0) console.log(`  updated ${changed}`)
  }
  console.log(`done: ${changed} updated, ${unchanged} already clean`)
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
