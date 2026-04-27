import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8')
}

describe('@dialogus/rag package.json', () => {
  const pkg = JSON.parse(readPackageFile('package.json')) as Record<string, unknown>

  it('declares the workspace package name and ESM type', () => {
    expect(pkg.name).toBe('@dialogus/rag')
    expect(pkg.type).toBe('module')
    expect(pkg.private).toBe(true)
  })

  it('declares the workspace dependencies required by ADR-006', () => {
    const deps = pkg.dependencies as Record<string, string> | undefined
    expect(deps).toBeDefined()
    expect(deps?.['@dialogus/shared']).toBe('workspace:*')
    expect(deps?.['@dialogus/db']).toBe('workspace:*')
    expect(deps?.['@dialogus/ingestion']).toBe('workspace:*')
  })

  it('declares the runtime deps slated for later tasks', () => {
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    expect(deps['@mastra/core']).toBeTypeOf('string')
    expect(deps['@mastra/memory']).toBeTypeOf('string')
    expect(deps['@ai-sdk/anthropic']).toBeTypeOf('string')
    expect(deps['@ai-sdk/openai']).toBeTypeOf('string')
    expect(deps.zod).toBeTypeOf('string')
    expect(deps['js-tiktoken']).toBeTypeOf('string')
  })

  it('exposes typecheck + test scripts', () => {
    const scripts = pkg.scripts as Record<string, string> | undefined
    expect(scripts?.typecheck).toBeTypeOf('string')
    expect(scripts?.test).toBeTypeOf('string')
  })
})

describe('@dialogus/rag tsconfig.json', () => {
  const tsconfig = JSON.parse(readPackageFile('tsconfig.json')) as Record<string, unknown>

  it('extends the root tsconfig', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.json')
  })

  it('includes src and __tests__', () => {
    expect(tsconfig.include).toEqual(expect.arrayContaining(['src', '__tests__']))
  })
})

describe('@dialogus/rag domain folder layout', () => {
  const folders = [
    'src/domain/ports',
    'src/domain/entities',
    'src/domain/errors',
    'src/domain/constants',
  ]

  it.each(folders)('exists: %s', (folder) => {
    expect(existsSync(join(packageRoot, folder))).toBe(true)
  })

  it('has no application layer yet', () => {
    expect(existsSync(join(packageRoot, 'src/application'))).toBe(false)
  })
})

describe('@dialogus/rag barrel', () => {
  it('exports the two RagError subclasses with code + cause', async () => {
    const mod = await import('@dialogus/rag')
    expect(typeof mod.SummaryNotFoundError).toBe('function')
    expect(typeof mod.EmbeddingFailedError).toBe('function')

    const cause = new Error('boom')
    const summary = new mod.SummaryNotFoundError('missing', { cause })
    expect(summary.message).toBe('missing')
    expect(summary.code).toBe('RAG_SUMMARY_NOT_FOUND')
    expect(summary.cause).toBe(cause)
    expect(summary.name).toBe('SummaryNotFoundError')

    const embedding = new mod.EmbeddingFailedError('embed-failed')
    expect(embedding.code).toBe('RAG_EMBEDDING_FAILED')
    expect(embedding.name).toBe('EmbeddingFailedError')
  })

  it('exports the citation marker regex per ADR-007', async () => {
    const mod = await import('@dialogus/rag')
    const validUuid = '01234567-89ab-cdef-0123-456789abcdef'

    mod.CITATION_MARKER_REGEX.lastIndex = 0
    expect(mod.CITATION_MARKER_REGEX.test(`{{cite:${validUuid}}}`)).toBe(true)

    mod.CITATION_MARKER_REGEX.lastIndex = 0
    const match = mod.CITATION_MARKER_REGEX.exec(`{{cite:${validUuid}}}`)
    expect(match?.[1]).toBe(validUuid)

    mod.CITATION_MARKER_REGEX.lastIndex = 0
    expect(mod.CITATION_MARKER_REGEX.test('{{cite:short}}')).toBe(false)
  })

  it('does not re-export application-layer or third-party agent symbols yet', () => {
    const indexSource = readPackageFile('src/index.ts')
    expect(indexSource).not.toMatch(/application/)
    expect(indexSource).not.toMatch(/@mastra/)
    expect(indexSource).not.toMatch(/@ai-sdk/)
  })
})

describe('@dialogus/rag domain layer is infrastructure-free', () => {
  const domainFiles = [
    'src/domain/ports/ChunkReadRepository.port.ts',
    'src/domain/ports/ChapterReadRepository.port.ts',
    'src/domain/ports/ChapterSummaryReadRepository.port.ts',
    'src/domain/ports/QueryEmbedder.port.ts',
    'src/domain/entities/ChunkWithContext.ts',
    'src/domain/entities/ChapterView.ts',
    'src/domain/entities/ChapterSummaryView.ts',
    'src/domain/errors/RagError.ts',
    'src/domain/constants/citation.ts',
  ]

  it.each(domainFiles)('%s exists', (file) => {
    expect(existsSync(join(packageRoot, file))).toBe(true)
  })

  it.each(domainFiles)('%s avoids forbidden imports', (file) => {
    const source = readPackageFile(file)
    expect(source).not.toMatch(/@dialogus\/ingestion/)
    expect(source).not.toMatch(/@mastra\//)
    expect(source).not.toMatch(/@ai-sdk\//)
    expect(source).not.toMatch(/from\s+['"]drizzle-orm/)
  })
})

describe('@dialogus/rag type-level surface (compile-time check)', () => {
  it('exposes ports + entities as TypeScript types', () => {
    const chunk: import('@dialogus/rag').ChunkWithContext = {
      chunkId: '01234567-89ab-cdef-0123-456789abcdef',
      bookId: '11111111-1111-1111-1111-111111111111',
      chapterId: '22222222-2222-2222-2222-222222222222',
      chapterOrdinal: 1,
      chapterTitle: 'Chapter 1',
      text: 'Call me Ishmael.',
      excerptPreview: 'Call me Ishmael.',
      score: 0.91,
    }

    const chapter: import('@dialogus/rag').ChapterView = {
      id: chunk.chapterId,
      bookId: chunk.bookId,
      ordinal: 1,
      title: 'Loomings',
      tokenCount: 1024,
    }

    const summary: import('@dialogus/rag').ChapterSummaryView = {
      bookId: chunk.bookId,
      chapterId: chunk.chapterId,
      chapterOrdinal: 1,
      chapterTitle: chapter.title,
      summary: 'Ishmael narrates...',
      tokenCount: 256,
      model: 'claude-haiku-4-5',
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    }

    const chunkRepo: import('@dialogus/rag').ChunkReadRepository = {
      searchSemantic: async () => [chunk],
      findById: async () => chunk,
      findCharacterMentions: async () => [chunk],
    }

    const chapterRepo: import('@dialogus/rag').ChapterReadRepository = {
      listByBook: async () => [chapter],
      findById: async () => chapter,
    }

    const summaryRepo: import('@dialogus/rag').ChapterSummaryReadRepository = {
      findByChapterId: async () => summary,
    }

    const embedder: import('@dialogus/rag').QueryEmbedder = {
      dimensions: 1536,
      modelName: 'text-embedding-3-small',
      embed: async () => Array.from({ length: 1536 }, () => 0),
    }

    expect(chunkRepo).toBeDefined()
    expect(chapterRepo).toBeDefined()
    expect(summaryRepo).toBeDefined()
    expect(embedder.dimensions).toBe(1536)
  })
})
