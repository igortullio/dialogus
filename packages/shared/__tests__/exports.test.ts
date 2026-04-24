import { describe, expect, it } from 'vitest'

describe('@dialogus/shared exports map', () => {
  it('resolves the main barrel', async () => {
    const mod = await import('@dialogus/shared')
    expect(mod).toBeTypeOf('object')
  })

  it('resolves the ./config subpath', async () => {
    const mod = await import('@dialogus/shared/config')
    expect(mod).toBeTypeOf('object')
  })

  it('resolves the ./errors subpath', async () => {
    const mod = await import('@dialogus/shared/errors')
    expect(mod).toBeTypeOf('object')
  })

  it('resolves the ./types subpath', async () => {
    const mod = await import('@dialogus/shared/types')
    expect(mod).toBeTypeOf('object')
  })

  it('resolves the ./schemas/health subpath', async () => {
    const mod = await import('@dialogus/shared/schemas/health')
    expect(mod).toBeTypeOf('object')
  })
})
