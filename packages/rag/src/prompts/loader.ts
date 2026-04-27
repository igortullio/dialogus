import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = resolve(here, 'system.md')

let cached: string | null = null

export function loadSystemPrompt(): string {
  if (cached !== null) {
    return cached
  }
  cached = readFileSync(SYSTEM_PROMPT_PATH, 'utf8')
  return cached
}

export function _resetSystemPromptCache(): void {
  cached = null
}
