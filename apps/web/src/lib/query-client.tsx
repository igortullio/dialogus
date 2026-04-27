'use client'

import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

const DEFAULT_STALE_TIME_MS = 30_000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient())
  return <TanstackQueryClientProvider client={client}>{children}</TanstackQueryClientProvider>
}
