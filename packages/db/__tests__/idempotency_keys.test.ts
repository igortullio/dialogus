import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { idempotencyKeys } from '../src/schema'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '..', 'drizzle', '0002_idempotency_keys.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')

const dialect = new PgDialect()
const config = getTableConfig(idempotencyKeys)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on idempotency_keys table`)
  }
  return column
}

function renderSql(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('idempotency_keys table', () => {
  it('targets the idempotency_keys table', () => {
    expect(config.name).toBe('idempotency_keys')
  })

  it('defines all columns from the ADR-003 schema block', () => {
    expect([...columnsByName.keys()].sort()).toEqual(
      ['created_at', 'key', 'request_hash', 'response_body', 'response_status'].sort(),
    )
  })

  it('marks key as the primary key text column', () => {
    const key = getColumn('key')
    expect(key.columnType).toBe('PgText')
    expect(key.primary).toBe(true)
    expect(key.notNull).toBe(true)
    expect(key.hasDefault).toBe(false)
  })

  it('marks request_hash as not-null text without a default', () => {
    const requestHash = getColumn('request_hash')
    expect(requestHash.columnType).toBe('PgText')
    expect(requestHash.notNull).toBe(true)
    expect(requestHash.hasDefault).toBe(false)
  })

  it('marks response_status as not-null integer without a default', () => {
    const responseStatus = getColumn('response_status')
    expect(responseStatus.columnType).toBe('PgInteger')
    expect(responseStatus.notNull).toBe(true)
    expect(responseStatus.hasDefault).toBe(false)
  })

  it('marks response_body as not-null jsonb without a default', () => {
    const responseBody = getColumn('response_body')
    expect(responseBody.columnType).toBe('PgJsonb')
    expect(responseBody.notNull).toBe(true)
    expect(responseBody.hasDefault).toBe(false)
  })

  it('marks created_at as a not-null timestamptz with now() default', () => {
    const createdAt = getColumn('created_at') as Column & { withTimezone?: boolean }
    expect(createdAt.columnType).toBe('PgTimestamp')
    expect(createdAt.notNull).toBe(true)
    expect(createdAt.hasDefault).toBe(true)
    expect(createdAt.withTimezone).toBe(true)
    expect(renderSql(createdAt.default)).toBe('now()')
  })

  it('declares the btree index on created_at for the cleanup job', () => {
    expect(config.indexes).toHaveLength(1)
    const idx = config.indexes[0]
    if (!idx) throw new Error('expected created_at index on idempotency_keys')
    expect(idx.config.name).toBe('idempotency_keys_created_at_idx')
    expect(idx.config.where).toBeUndefined()
    const columnNames = idx.config.columns.map((column) => (column as Column).name)
    expect(columnNames).toEqual(['created_at'])
  })

  it('declares no CHECK constraints', () => {
    expect(config.checks).toHaveLength(0)
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports idempotencyKeys', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.idempotencyKeys).toBe(idempotencyKeys)
  })
})

describe('drizzle/0002_idempotency_keys.sql migration', () => {
  it('creates the idempotency_keys table with the expected columns', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "idempotency_keys"/)
    expect(migrationSql).toMatch(/"key" text PRIMARY KEY NOT NULL/)
    expect(migrationSql).toMatch(/"request_hash" text NOT NULL/)
    expect(migrationSql).toMatch(/"response_status" integer NOT NULL/)
    expect(migrationSql).toMatch(/"response_body" jsonb NOT NULL/)
    expect(migrationSql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/)
  })

  it('creates the btree index on created_at', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree \("created_at"\)/,
    )
  })
})
