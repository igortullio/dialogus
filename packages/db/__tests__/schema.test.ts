import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { systemHealth } from '../src/schema'

const dialect = new PgDialect()
const config = getTableConfig(systemHealth)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on system_health table`)
  }
  return column
}

function renderDefault(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('systemHealth table', () => {
  it('targets the system_health table', () => {
    expect(config.name).toBe('system_health')
  })

  it('defines id, status, and created_at columns', () => {
    expect([...columnsByName.keys()].sort()).toEqual(['created_at', 'id', 'status'])
  })

  it('marks id as a UUID primary key with uuid_generate_v4() default', () => {
    const id = getColumn('id')
    expect(id.columnType).toBe('PgUUID')
    expect(id.primary).toBe(true)
    expect(id.notNull).toBe(true)
    expect(id.hasDefault).toBe(true)
    expect(renderDefault(id.default)).toBe('uuid_generate_v4()')
  })

  it("marks status as text not null with default 'ok'", () => {
    const status = getColumn('status')
    expect(status.columnType).toBe('PgText')
    expect(status.notNull).toBe(true)
    expect(status.hasDefault).toBe(true)
    expect(status.default).toBe('ok')
  })

  it('marks created_at as timestamp not null with now() default', () => {
    const createdAt = getColumn('created_at')
    expect(createdAt.columnType).toBe('PgTimestamp')
    expect(createdAt.notNull).toBe(true)
    expect(createdAt.hasDefault).toBe(true)
    expect(renderDefault(createdAt.default)).toBe('now()')
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports systemHealth as a named export', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.systemHealth).toBe(systemHealth)
  })
})
