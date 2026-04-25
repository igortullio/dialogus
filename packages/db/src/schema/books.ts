import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const INGESTION_STATUS_VALUES = [
  'discovered',
  'downloading',
  'parsing',
  'chunking',
  'embedding',
  'ready',
  'failed',
] as const

export type IngestionStatus = (typeof INGESTION_STATUS_VALUES)[number]

export interface BookAuthor {
  name: string
  birthYear: number | null
  deathYear: number | null
}

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    gutendexId: integer('gutendex_id').notNull().unique(),
    title: text('title').notNull(),
    authors: jsonb('authors').$type<BookAuthor[]>().notNull(),
    languages: text('languages').array().notNull(),
    subjects: text('subjects').array().notNull().default(sql`'{}'`),
    downloadUrlEpub: text('download_url_epub'),
    downloadUrlTxt: text('download_url_txt'),
    coverUrl: text('cover_url'),
    rawHash: text('raw_hash'),
    ingestionStatus: text('ingestion_status', { enum: INGESTION_STATUS_VALUES })
      .notNull()
      .default('discovered'),
    ingestionError: text('ingestion_error'),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('books_created_at_id_active_idx')
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index('books_ingestion_status_active_idx')
      .on(table.ingestionStatus)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      'books_ingestion_status_check',
      sql`${table.ingestionStatus} IN ('discovered', 'downloading', 'parsing', 'chunking', 'embedding', 'ready', 'failed')`,
    ),
  ],
)
