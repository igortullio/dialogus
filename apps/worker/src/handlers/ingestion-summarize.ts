import type { Job } from '@dialogus/db/pgboss'
import type { StagePayload } from '@dialogus/ingestion/application/stages/_common'
import {
  type SummarizeStageDeps,
  summarizeStage,
} from '@dialogus/ingestion/application/stages/summarize'
import type { Logger } from 'pino'

export const SUMMARIZE_QUEUE = 'ingestion.summarize' as const

export interface SummarizeHandlerInput {
  readonly deps: Omit<SummarizeStageDeps, 'logger'>
  readonly logger: Logger
}

export function createSummarizeHandler(
  input: SummarizeHandlerInput,
): (jobs: Job<StagePayload>[]) => Promise<void> {
  const stageLogger = input.logger.child({ stage: 'summarize' })
  const stageDeps: SummarizeStageDeps = { ...input.deps, logger: stageLogger }
  return async (jobs) => {
    for (const job of jobs) {
      await summarizeStage(job.data, stageDeps)
    }
  }
}
