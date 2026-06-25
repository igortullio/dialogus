# Contracts — Ingestion Progress Tracking

This feature **adds no new endpoints and no new error slugs**. It enriches two existing,
membership-gated, Zod-enveloped routes and adds a web-side presentation contract. Existing
`urn:dialogus:problems:*` slugs are reused; the Better Auth group is untouched.

| Contract | Surface | Change |
|---|---|---|
| [ingestion-status.md](./ingestion-status.md) | `GET /api/library/books/:id/ingestion` + library list DTO | Enriched payload: overall progress, ordered stage breakdown, elapsed/ETA, queued/stalled, error gains failing stage |
| [ingestion-retry.md](./ingestion-retry.md) | `POST /api/library/books/:id/ingest/retry` + web retry UX | Unchanged server behavior; the response's resume stage is surfaced as "resume-not-restart" copy, retryable-only affordance |

Cross-cutting:
- **Web presentation contract** — `apps/web/src/lib/ingestion/messages.ts`: a `slug → {pt, en}`
  friendly-message map + stage display names. The raw `"<slug>: <message>"` MUST NOT be rendered
  to users; it may appear only behind an explicit "detalhes técnicos" disclosure.
- **Envelope**: all responses keep the existing `envelope(...)` shape (`{ data, meta?, links? }`)
  and Zod validation at the route boundary (`schema.parse(result)`).
- **Errors**: RFC 9457 `application/problem+json` with existing slugs (e.g. book not-found,
  `book-already-ready`, `book-not-in-retryable-state`). No new slugs introduced.
