import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const drizzleDir = join(__dirname, '..', 'drizzle')

describe('drizzle/0000_init.sql', () => {
  const sql = readFileSync(join(drizzleDir, '0000_init.sql'), 'utf8')

  it('declares the pgvector extension', () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector;/)
  })

  it('declares the uuid-ossp extension with the quoted identifier', () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/)
  })

  it('creates the system_health table', () => {
    expect(sql).toMatch(/CREATE TABLE "system_health"/)
  })

  it('appends the system_health seed row', () => {
    expect(sql).toMatch(/INSERT INTO system_health \(status\) VALUES \('ok'\);/)
  })

  it('declares both extensions before the system_health CREATE TABLE statement', () => {
    const vectorIdx = sql.indexOf('CREATE EXTENSION IF NOT EXISTS vector;')
    const uuidIdx = sql.indexOf('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    const tableIdx = sql.indexOf('CREATE TABLE "system_health"')
    expect(vectorIdx).toBeGreaterThanOrEqual(0)
    expect(uuidIdx).toBeGreaterThanOrEqual(0)
    expect(tableIdx).toBeGreaterThanOrEqual(0)
    expect(vectorIdx).toBeLessThan(tableIdx)
    expect(uuidIdx).toBeLessThan(tableIdx)
  })

  it('places the seed INSERT after the CREATE TABLE statement', () => {
    const tableIdx = sql.indexOf('CREATE TABLE "system_health"')
    const insertIdx = sql.indexOf('INSERT INTO system_health')
    expect(tableIdx).toBeLessThan(insertIdx)
  })
})

describe('drizzle/meta/_journal.json', () => {
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')) as {
    dialect: string
    entries: Array<{ idx: number; tag: string }>
  }

  it('targets the postgresql dialect', () => {
    expect(journal.dialect).toBe('postgresql')
  })

  it('registers the 0000_init migration so drizzle-kit migrate can apply it', () => {
    const initEntry = journal.entries.find((entry) => entry.idx === 0)
    expect(initEntry).toBeDefined()
    expect(initEntry?.tag).toBe('0000_init')
  })
})
