'use client'

// Replaced in task_08 by `apps/web/src/components/citation/CitationBadge.tsx`
// (full tooltip + side-panel behavior). For task_07 the message renderer needs a
// distinguishable placeholder so the parser pipeline can be tested end-to-end.

export interface CitationBadgePlaceholderProps {
  readonly chunkId: string
  readonly index: number
}

export function CitationBadgePlaceholder({ chunkId, index }: CitationBadgePlaceholderProps) {
  return (
    <sup
      data-slot="citation-badge-placeholder"
      data-chunk-id={chunkId}
      data-citation-index={index}
      className="mx-0.5 rounded-(--radius-cite-badge) bg-scholarly/10 px-1 text-[0.7em] text-scholarly"
    >
      <span className="sr-only">{`Citação ${index}: `}</span>
      {index}
    </sup>
  )
}
