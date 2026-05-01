export const THREADS_QUERY_KEY = ['threads'] as const
export const LIBRARY_QUERY_KEY = ['library'] as const
export const INGESTION_QUERY_KEY = (id: string) => ['ingestion', id] as const
