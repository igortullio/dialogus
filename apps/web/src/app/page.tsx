import type { CSSProperties } from 'react'
import { fetchHealth } from '../lib/health'
import { fetchLibraryCountByStatus } from '../lib/library'

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '2rem',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: '#111',
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: '3rem',
  letterSpacing: '-0.02em',
}

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  color: '#444',
  fontVariantNumeric: 'tabular-nums',
}

export default async function Page() {
  const [{ api, db, pgboss }, { total, ready }] = await Promise.all([
    fetchHealth(),
    fetchLibraryCountByStatus(),
  ])
  return (
    <main style={containerStyle}>
      <h1 style={headingStyle}>dIAlogus</h1>
      <p style={statusStyle}>
        api: {api} / db: {db} / pgboss: {pgboss} / livros: {total} (prontos: {ready})
      </p>
    </main>
  )
}
