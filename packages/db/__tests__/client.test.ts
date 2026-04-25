import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase } from '../src/client'

const db = createDatabase('postgres://test:test@127.0.0.1:54329/test')

afterAll(async () => {
  await db.$client.end({ timeout: 0 })
})

describe('createDatabase', () => {
  it('returns a Drizzle postgres-js instance with execute and query accessors', () => {
    expect(typeof db.execute).toBe('function')
    expect(typeof db.query).toBe('object')
  })

  it('attaches the schema barrel so query.<table> is reachable', () => {
    expect(db.query.systemHealth).toBeDefined()
  })

  it('exposes the underlying postgres.js client via $client', () => {
    expect(typeof db.$client).toBe('function')
  })
})
