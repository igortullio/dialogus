'use client'

import { TriangleAlert } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { openUnresolvedPanel } from './citation-panel-state'

const HOVER_DELAY_MS = 300
const UNRESOLVED_LABEL = 'Citação não-resolvida'

export interface UnresolvedCitationBadgeProps {
  readonly className?: string
}

export function UnresolvedCitationBadge({ className }: UnresolvedCitationBadgeProps) {
  return (
    <TooltipProvider delayDuration={HOVER_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup
            data-slot="unresolved-citation-badge"
            className={cn('mx-0.5 inline-block leading-none align-super', className)}
          >
            <button
              type="button"
              aria-label={UNRESOLVED_LABEL}
              onClick={() => openUnresolvedPanel()}
              className={cn(
                'inline-flex h-4 min-w-4 cursor-pointer items-center justify-center',
                'rounded-(--radius-cite-badge) border border-status-failed/40',
                'bg-status-failed/10 px-1 text-status-failed transition-colors',
                'hover:bg-status-failed/20 hover:border-status-failed/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-failed',
              )}
            >
              <TriangleAlert aria-hidden className="h-2.5 w-2.5" />
            </button>
          </sup>
        </TooltipTrigger>
        <TooltipContent role="tooltip" side="top" sideOffset={4}>
          {UNRESOLVED_LABEL}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
