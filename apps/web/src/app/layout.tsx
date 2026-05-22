import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AddGutendexSheet } from '@/components/library/AddGutendexSheet'
import { IngestionMonitor } from '@/components/library/IngestionMonitor'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { QueryClientProvider } from '@/lib/query-client'
import './globals.css'

export const metadata: Metadata = {
  title: 'dIAlogus',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryClientProvider>
            {children}
            <AddGutendexSheet />
            <IngestionMonitor />
          </QueryClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
