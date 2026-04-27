import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  useLocalRuntime,
} from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function QueryWrapper({
  client,
  children,
}: {
  readonly client: QueryClient
  readonly children: ReactNode
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const idleAdapter: ChatModelAdapter = {
  async run() {
    return { content: [{ type: 'text', text: 'ok' }] }
  },
}

export function RuntimeWrapper({
  children,
  adapter = idleAdapter,
}: {
  readonly children: ReactNode
  readonly adapter?: ChatModelAdapter
}) {
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
