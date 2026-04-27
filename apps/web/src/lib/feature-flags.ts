/**
 * Build-time feature flags resolved during task_01 setup.
 *
 * MASTRA_THREAD_METADATA_AVAILABLE is set by the Mastra metadata verification
 * (see __tests__/setup/mastra-metadata-verification.test.ts and ADR-007). It
 * gates whether `useThreadMetadata` (task_05) talks to Mastra directly or to
 * the fallback `thread_metadata` table + endpoints.
 */
export const MASTRA_THREAD_METADATA_AVAILABLE = true as const

export type MastraThreadMetadataAvailable = typeof MASTRA_THREAD_METADATA_AVAILABLE
