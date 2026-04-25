import { ConfigError, DialogusError, NotFoundError, ValidationError } from '@dialogus/shared/errors'
import { describe, expect, it } from 'vitest'

const subclasses = [
  { Ctor: ConfigError, name: 'ConfigError' },
  { Ctor: NotFoundError, name: 'NotFoundError' },
  { Ctor: ValidationError, name: 'ValidationError' },
] as const

describe('DialogusError hierarchy', () => {
  it.each(subclasses)('$name preserves code and own class name', ({ Ctor, name }) => {
    const err = new Ctor('CODE_X', 'something went wrong')
    expect(err.code).toBe('CODE_X')
    expect(err.message).toBe('something went wrong')
    expect(err.name).toBe(name)
    expect(String(err)).toBe(`${name}: something went wrong`)
  })

  it.each(subclasses)('$name is instanceof DialogusError and Error', ({ Ctor }) => {
    const err = new Ctor('CODE', 'msg')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(Error)
  })

  it('keeps subclasses distinguishable via instanceof', () => {
    const cfg = new ConfigError('A', 'a')
    const nf = new NotFoundError('B', 'b')
    const val = new ValidationError('C', 'c')

    expect(cfg).toBeInstanceOf(ConfigError)
    expect(cfg).not.toBeInstanceOf(NotFoundError)
    expect(cfg).not.toBeInstanceOf(ValidationError)

    expect(nf).toBeInstanceOf(NotFoundError)
    expect(nf).not.toBeInstanceOf(ConfigError)
    expect(nf).not.toBeInstanceOf(ValidationError)

    expect(val).toBeInstanceOf(ValidationError)
    expect(val).not.toBeInstanceOf(ConfigError)
    expect(val).not.toBeInstanceOf(NotFoundError)
  })

  it('preserves the original cause when one is passed', () => {
    const original = new Error('boom')
    const err = new ConfigError('WRAPPED', 'outer', original)
    expect(err.cause).toBe(original)
  })

  it('treats cause as undefined when omitted', () => {
    const err = new NotFoundError('NO_CAUSE', 'missing')
    expect(err.cause).toBeUndefined()
  })

  it('exposes the matching example used in the task spec', () => {
    const err = new ConfigError('MISSING_ENV', 'x')
    expect(err.code).toBe('MISSING_ENV')
    expect(err.name).toBe('ConfigError')
  })
})
