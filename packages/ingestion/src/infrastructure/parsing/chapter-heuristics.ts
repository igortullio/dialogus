import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_YAML_PATH = resolve(here, 'chapter-heuristics.yaml')

const LanguageHeuristicsSchema = z.object({
  patterns: z.array(z.string().min(1)).min(1),
  fallback_title: z.string().min(1),
})

export const ChapterHeuristicsSchema = z.object({
  en: LanguageHeuristicsSchema,
  pt: LanguageHeuristicsSchema,
})

export type RawChapterHeuristics = z.infer<typeof ChapterHeuristicsSchema>

export interface LanguageHeuristics {
  readonly patterns: readonly RegExp[]
  readonly fallbackTitle: string
}

export interface ChapterHeuristicsConfig {
  readonly en: LanguageHeuristics
  readonly pt: LanguageHeuristics
}

let cache: ChapterHeuristicsConfig | null = null

export function loadChapterHeuristics(): ChapterHeuristicsConfig {
  if (cache) {
    return cache
  }
  const yamlText = readFileSync(DEFAULT_YAML_PATH, 'utf8')
  cache = parseChapterHeuristics(yamlText)
  return cache
}

export function parseChapterHeuristics(yamlText: string): ChapterHeuristicsConfig {
  const parsed: unknown = parseYaml(yamlText)
  const config = ChapterHeuristicsSchema.parse(parsed)
  return compileChapterHeuristics(config)
}

export function compileChapterHeuristics(raw: RawChapterHeuristics): ChapterHeuristicsConfig {
  return {
    en: compileLanguage('en', raw.en),
    pt: compileLanguage('pt', raw.pt),
  }
}

function compileLanguage(
  language: 'en' | 'pt',
  config: { patterns: string[]; fallback_title: string },
): LanguageHeuristics {
  const patterns = config.patterns.map((source, index) => {
    try {
      return new RegExp(source, 'i')
    } catch (cause) {
      throw new Error(
        `chapter-heuristics: invalid pattern at ${language}.patterns[${index}] "${source}"`,
        { cause },
      )
    }
  })
  return { patterns, fallbackTitle: config.fallback_title }
}

// Test seam: clears the module-level cache so a fresh load can be observed.
export function _resetChapterHeuristicsCache(): void {
  cache = null
}
