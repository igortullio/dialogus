import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// When bundled by Mastra, import.meta.url points to a .cache/ directory; fall
// back to the workspace source path so the file is always resolvable.
function findSystemPromptPath(): string {
  const adjacent = resolve(here, 'system.md')
  if (existsSync(adjacent)) return adjacent
  // Walk up from .cache/ → node_modules/ → packages/rag/ + src/prompts/system.md
  const fromWorkspace = resolve(here, '..', '..', 'src', 'prompts', 'system.md')
  if (existsSync(fromWorkspace)) return fromWorkspace
  // Absolute fallback: cwd-relative (works when cwd is the monorepo root)
  return resolve(process.cwd(), 'packages', 'rag', 'src', 'prompts', 'system.md')
}

const SYSTEM_PROMPT_PATH = findSystemPromptPath()

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
