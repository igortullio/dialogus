import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..')
const hookPath = join(repoRoot, '.githooks', 'pre-commit')

describe('.githooks/pre-commit', () => {
  const raw = readFileSync(hookPath, 'utf8')

  it('starts with a POSIX sh shebang', () => {
    const firstLine = raw.split('\n')[0]
    expect(firstLine).toBe('#!/bin/sh')
  })

  it('enables set -e for fail-fast semantics', () => {
    expect(raw).toMatch(/^set -e$/m)
  })

  it('runs pnpm lint, typecheck, and test in that order', () => {
    const lintIdx = raw.indexOf('pnpm lint')
    const typecheckIdx = raw.indexOf('pnpm typecheck')
    const testIdx = raw.indexOf('pnpm test')
    expect(lintIdx).toBeGreaterThanOrEqual(0)
    expect(typecheckIdx).toBeGreaterThan(lintIdx)
    expect(testIdx).toBeGreaterThan(typecheckIdx)
  })

  it('does NOT invoke integration tests', () => {
    expect(raw).not.toMatch(/test:integration/)
  })

  it('is executable by the owner', () => {
    const mode = statSync(hookPath).mode
    const ownerExecBit = 0o100
    expect(mode & ownerExecBit).toBe(ownerExecBit)
  })
})
