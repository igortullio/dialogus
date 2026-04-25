import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PRD_PATH = resolve(__dirname, '..', '.compozy', 'tasks', '000-foundation', '_prd.md')

const SETUP_TARGET_MINUTES = 15
const PRE_COMMIT_TARGET_SECONDS = 30

const ISO_8601_UTC = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/

interface Annotation {
  body: string
  closedAt: string
  setupSeconds: number
  preCommitSeconds: number
}

function readAnnotation(): Annotation {
  const prd = readFileSync(PRD_PATH, 'utf8')
  const idx = prd.indexOf('\n## Exit Criteria Verification')
  if (idx === -1) throw new Error('Exit Criteria Verification section missing from _prd.md')
  const body = prd.slice(idx)

  const closedAtMatch = body.match(/\*\*Closed at:\*\*\s+(\S+)/)
  if (!closedAtMatch) throw new Error('Closed at timestamp missing')
  const closedAt = closedAtMatch[1] ?? ''

  const setupMatch = body.match(
    /Fresh-clone setup time[^\n]*?~?(\d+(?:\.\d+)?)\s*(seconds?|minutes?)/i,
  )
  if (!setupMatch) throw new Error('Setup time measurement missing')
  const setupValue = Number.parseFloat(setupMatch[1] ?? '')
  const setupUnit = (setupMatch[2] ?? '').toLowerCase()
  const setupSeconds = setupUnit.startsWith('minute') ? setupValue * 60 : setupValue

  const preCommitMatch = body.match(/Pre-commit runtime[^\n]*?(\d+(?:\.\d+)?)\s*seconds?/i)
  if (!preCommitMatch) throw new Error('Pre-commit runtime measurement missing')
  const preCommitSeconds = Number.parseFloat(preCommitMatch[1] ?? '')

  return { body, closedAt, setupSeconds, preCommitSeconds }
}

describe('Foundation _prd.md closure annotation', () => {
  it('contains an "Exit Criteria Verification" section appended at the bottom', () => {
    const a = readAnnotation()
    expect(a.body).toContain('## Exit Criteria Verification')
    expect(a.body).toMatch(/Foundation V1 status[\s\S]*Phase 1 closed/i)
  })

  it('records an ISO-8601 UTC closure timestamp', () => {
    const a = readAnnotation()
    expect(a.closedAt).toMatch(ISO_8601_UTC)
  })

  it('records a setup time within the PRD target (≤ 15 minutes)', () => {
    const a = readAnnotation()
    expect(Number.isFinite(a.setupSeconds)).toBe(true)
    expect(a.setupSeconds).toBeLessThanOrEqual(SETUP_TARGET_MINUTES * 60)
  })

  it('records a pre-commit runtime within the PRD target (≤ 30 seconds)', () => {
    const a = readAnnotation()
    expect(Number.isFinite(a.preCommitSeconds)).toBe(true)
    expect(a.preCommitSeconds).toBeLessThanOrEqual(PRE_COMMIT_TARGET_SECONDS)
  })

  it('marks each PRD exit criterion with verification evidence', () => {
    const a = readAnnotation()
    for (const criterion of [
      'pnpm install && docker compose up -d',
      'localhost:3000',
      'Pre-commit blocks',
      'CI is green',
      'README',
    ]) {
      expect(a.body).toContain(criterion)
    }
  })
})
