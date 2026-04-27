import {
  type ThreadMetadata,
  type ThreadMetadataUpdate,
  threadMetadataSchema,
  threadMetadataUpdateSchema,
} from '@dialogus/shared/schemas/thread'
import { describe, expect, it } from 'vitest'

describe('threadMetadataSchema', () => {
  it('accepts a thread with a custom title and pinned=true', () => {
    const result = threadMetadataSchema.safeParse({
      custom_title: 'Memorias deep dive',
      pinned: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: ThreadMetadata = result.data
      expect(parsed.custom_title).toBe('Memorias deep dive')
      expect(parsed.pinned).toBe(true)
    }
  })

  it('accepts a thread with no custom title (null) and pinned=false', () => {
    const result = threadMetadataSchema.safeParse({ custom_title: null, pinned: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.custom_title).toBeNull()
      expect(result.data.pinned).toBe(false)
    }
  })

  it('rejects when custom_title is missing', () => {
    const result = threadMetadataSchema.safeParse({ pinned: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'custom_title')
      expect(issue).toBeDefined()
    }
  })

  it('rejects when pinned is missing', () => {
    const result = threadMetadataSchema.safeParse({ custom_title: 'foo' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'pinned')
      expect(issue).toBeDefined()
    }
  })

  it('rejects a non-boolean pinned value', () => {
    const result = threadMetadataSchema.safeParse({ custom_title: 'foo', pinned: 'true' })
    expect(result.success).toBe(false)
  })

  it('round-trips through JSON without loss', () => {
    const original: ThreadMetadata = { custom_title: 'foo', pinned: true }
    const roundTripped = JSON.parse(JSON.stringify(original))
    const result = threadMetadataSchema.safeParse(roundTripped)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(original)
    }
  })
})

describe('threadMetadataUpdateSchema', () => {
  it('accepts a partial update with only pinned', () => {
    const result = threadMetadataUpdateSchema.safeParse({ pinned: true })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: ThreadMetadataUpdate = result.data
      expect(parsed.pinned).toBe(true)
      expect(parsed.custom_title).toBeUndefined()
    }
  })

  it('accepts a partial update with only custom_title', () => {
    const result = threadMetadataUpdateSchema.safeParse({ custom_title: 'Renomeado' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.custom_title).toBe('Renomeado')
      expect(result.data.pinned).toBeUndefined()
    }
  })

  it('accepts an empty object (all fields optional)', () => {
    const result = threadMetadataUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts both fields together', () => {
    const result = threadMetadataUpdateSchema.safeParse({ custom_title: 'foo', pinned: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.custom_title).toBe('foo')
      expect(result.data.pinned).toBe(false)
    }
  })

  it('accepts setting custom_title back to null (revert to auto-title)', () => {
    const result = threadMetadataUpdateSchema.safeParse({ custom_title: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.custom_title).toBeNull()
    }
  })

  it('rejects a non-boolean pinned value', () => {
    const result = threadMetadataUpdateSchema.safeParse({ pinned: 'true' })
    expect(result.success).toBe(false)
  })
})
