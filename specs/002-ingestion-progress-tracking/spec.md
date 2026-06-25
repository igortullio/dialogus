# Feature Specification: Ingestion Progress Tracking & Observability

**Feature Branch**: `002-ingestion-progress-tracking`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "quero ajustar todo o fluxo de ingestão de livros, atualmente não está bom o acompanhamento do que está ocorrendo. Suba a aplicação e teste tudo com o playwright"

## Overview

When a person adds a public-domain title to dIAlogus, the system runs a multi-stage
ingestion pipeline (download → clean → parse → chunk → summarize → embed → index)
before the book becomes available for study. Today the user can see a coarse status
badge ("Baixando 45%") and a single per-stage progress bar, but the *acompanhamento*
— the moment-to-moment sense of what is happening, how far along it is, whether it is
healthy, and what to do when it breaks — is weak. Long stages look frozen, instant
(cached) stages look glitchy, the overall position in the 7-stage pipeline is invisible,
and failures are opaque about which stage broke, why, and whether recovery is safe.

This feature reworks the **observability of the whole ingestion flow** end to end: the
backend emits richer, work-accurate progress signals, and every surface that shows
ingestion state presents a clear, trustworthy, continuously-updating picture of progress,
timing, and failures — without changing the pipeline's fundamental stage chain, its
idempotent resume-from-failed-stage guarantee, or the 2-second polling cadence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See clear end-to-end progress while a book ingests (Priority: P1)

A user adds a title and watches it ingest. At a glance they can tell which stage of the
overall pipeline the book is in, how far through the whole process it is (not just the
current stage), and that it is actively moving forward rather than stuck.

**Why this priority**: This is the core complaint — "não está bom o acompanhamento do
que está ocorrendo." Restoring a continuous, legible sense of progress is the minimum
viable improvement and the foundation every other story builds on. It delivers value on
its own even if nothing else ships.

**Independent Test**: Trigger ingestion for a title and observe the library + book card.
Verify the UI shows the ordered list of pipeline stages with each stage's state
(completed / in-progress / pending / failed), an overall progress indication (e.g.,
"stage 4 of 7"), and that the displayed progress advances over time without manual
refresh.

**Acceptance Scenarios**:

1. **Given** a book whose ingestion has just started, **When** the user views the library,
   **Then** they see the pipeline represented as an ordered sequence of named stages with
   the current stage highlighted as in-progress and earlier stages marked completed.
2. **Given** a book actively progressing through a stage, **When** the user keeps the view
   open, **Then** the progress indication updates on its own (at the polling cadence)
   without the user refreshing the page.
3. **Given** a book mid-ingestion, **When** the user reads the status, **Then** they can
   identify both the current stage and the book's overall position in the full pipeline
   (e.g., how many stages are done out of the total).
4. **Given** a stage that completes instantly because its work was cached/already done,
   **When** the pipeline advances past it, **Then** that stage is shown as completed (and
   marked as skipped/cached where applicable) rather than appearing to be skipped in error.
5. **Given** a book that has reached the final state, **When** ingestion finishes,
   **Then** the user is notified of completion and the book is shown as ready for study.

---

### User Story 2 - Understand and recover from failures (Priority: P2)

When ingestion fails, the user immediately understands which stage failed, gets a
human-readable reason, learns whether the failure is recoverable, and — when it is — can
retry with confidence that already-completed work is preserved and the pipeline resumes
rather than restarts.

**Why this priority**: Failures are where opacity hurts most; an unrecoverable wall with a
cryptic message erodes trust and wastes time. This builds directly on the P1 progress
model and turns it into an actionable recovery experience.

**Independent Test**: Force an ingestion failure at a known stage, then verify the UI
names the failing stage, shows a readable reason, offers retry only when the failure is
recoverable, and on retry resumes from the failed stage (earlier completed stages are not
repeated).

**Acceptance Scenarios**:

1. **Given** an ingestion that failed at a specific stage, **When** the user views the
   book, **Then** the failing stage is named and a human-readable reason is shown (not just
   an internal code).
2. **Given** a failure that is recoverable, **When** the user views the book, **Then** a
   retry action is offered, and triggering it resumes the pipeline from the failed stage.
3. **Given** a failure that is **not** recoverable, **When** the user views the book,
   **Then** no retry action is offered and the user is told the failure cannot be retried
   (with guidance on what, if anything, they can do).
4. **Given** a stage that failed after partially completing its work, **When** the user
   retries, **Then** the previously completed stages are not repeated and progress
   continues from where it broke.
5. **Given** a retry has been triggered, **When** the user watches the book, **Then** the
   UI clearly shows it has re-entered processing at the resumed stage.

---

### User Story 3 - Follow work-level progress during long stages (Priority: P3)

For the long-running stages that process a book in many units (e.g., summarizing chapters,
embedding chunks), the user can see real sub-progress — how many units of work are done out
of the total — plus elapsed time, so a multi-minute stage never looks frozen.

**Why this priority**: This is the difference between "looks stuck" and "clearly working"
for the slowest parts of the pipeline. It refines the P1 progress model with finer detail
where it matters most, but the product is already usable without it.

**Independent Test**: Ingest a book large enough that a batch stage runs for more than a
few seconds; verify the UI shows units-completed-of-total for that stage and that the value
increases over time, plus elapsed time for the running stage.

**Acceptance Scenarios**:

1. **Given** a batch stage processing many units, **When** the user views the book,
   **Then** the UI shows progress in terms of units completed out of the total (e.g.,
   chapters or chunks), not only a single 0–100% bar.
2. **Given** a stage that has been running for a while, **When** the user views the book,
   **Then** elapsed time for the current stage (and/or overall) is visible.
3. **Given** a long batch stage in progress, **When** the user keeps watching, **Then** the
   unit count advances at least once within the time it takes to process a reasonable batch,
   so the stage never appears frozen.

---

### Edge Cases

- **Queued but not running**: the worker is busy or offline and a job sits waiting — the UI
  must distinguish "queued/waiting to start" from "actively processing" so the book does not
  look stalled at 0%.
- **Instant/cached stages**: download/clean/parse may complete near-instantly on a cache hit;
  the pipeline must not appear to skip or glitch — these stages are shown completed (and
  marked cached where applicable).
- **Very fast final stage**: the indexing stage can finish in well under a second; it must not
  read as "stuck at 0%."
- **Page refresh / re-entry mid-ingestion**: reopening the app reconstructs the current
  progress from persisted state with no loss of detail.
- **Multiple surfaces in sync**: the library list and the individual book card must not show
  contradictory states for the same book.
- **Shared corpus, multiple viewers**: when a title is ingested once and reused, all members
  with access see consistent progress; non-members must not see ingestion status at all.
- **Concurrent ingestions**: several books ingesting at once each show independent, correct
  progress.
- **Book with degenerate structure** (e.g., zero detected chapters/chunks): progress and
  completion still resolve to a sensible terminal state rather than dividing-by-zero or
  hanging at an intermediate percentage.
- **Terminal-state notification de-duplication**: a book reaching ready/failed notifies the
  user once, not repeatedly on every poll.
- **Stalled work detection**: if no progress is observed for an extended period while a book
  is nominally "processing," the user is given a signal rather than an indefinitely frozen bar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present the ingestion pipeline as an ordered sequence of named
  stages, each showing its state: completed, in-progress, pending, failed, or skipped/cached.
- **FR-002**: The system MUST show an overall pipeline position for each in-progress book
  (e.g., current stage index out of the total number of stages) in addition to per-stage
  progress.
- **FR-003**: The system MUST update displayed progress automatically at the established
  polling cadence (no tighter than every 2 seconds) without requiring a manual page refresh.
- **FR-004**: For batch stages that process many discrete units, the system MUST surface
  sub-progress as units completed out of the total, so progress reflects actual work done.
- **FR-005**: The system MUST visually distinguish stages that completed instantly because
  their work was cached or already done, so rapid transitions are not perceived as errors.
- **FR-006**: The system MUST distinguish a job that is queued/waiting to start from a job
  that is actively processing.
- **FR-007**: The system MUST display elapsed time for an in-progress ingestion (at minimum
  overall; per-stage where determinable), and where a reliable estimate is possible, an
  estimated time remaining.
- **FR-008**: On failure, the system MUST display the failing stage name and a human-readable
  reason for the failure (not only an internal error code).
- **FR-009**: The system MUST offer a retry action only when the failure is recoverable, and
  MUST NOT offer retry for non-recoverable failures; when retry is unavailable the user MUST
  be told so.
- **FR-010**: When a recoverable failure is retried, the system MUST resume the pipeline from
  the failed stage and MUST NOT repeat already-completed stages, preserving prior work.
- **FR-011**: After a retry is triggered, the system MUST clearly reflect that the book has
  re-entered processing at the resumed stage.
- **FR-012**: The system MUST notify the user once when a book reaches a terminal state
  (ready or failed), without repeating the notification on subsequent polls.
- **FR-013**: The system MUST reconstruct accurate, current ingestion progress from persisted
  state after a page refresh or re-entry, with no loss of stage/sub-progress detail.
- **FR-014**: All surfaces that display ingestion state (e.g., library list and book card)
  MUST present mutually consistent status for the same book.
- **FR-015**: The system MUST restrict visibility of ingestion progress to users who have
  access to the book; users without access MUST NOT be able to observe its ingestion status.
- **FR-016**: The system MUST surface a signal when a "processing" book has shown no progress
  for an extended period (suspected stall), rather than leaving an indefinitely static bar.
- **FR-017**: The system MUST resolve books with degenerate structure (e.g., zero processable
  units) to a sensible terminal state rather than hanging at an intermediate value.
- **FR-018**: The ingestion lifecycle and its observable states (progress, stage transitions,
  failure, recovery) MUST be verifiable through automated end-to-end browser tests covering
  the library and book-card surfaces.

### Key Entities *(include if feature involves data)*

- **Ingestion Run**: a single execution of the pipeline for one book; carries the current
  state, the current/last stage, overall progress, start time, completion time, and — on
  failure — the failing stage and reason/recoverability.
- **Pipeline Stage**: a named, ordered step in the chain (download, clean, parse, chunk,
  summarize, embed, index); has a state (completed / in-progress / pending / failed /
  skipped-cached) and, for batch stages, a unit-progress (completed-of-total).
- **Stage Progress Signal**: the incremental update emitted while a stage runs (per-stage
  percentage and/or units completed) that drives the continuously-updating display.
- **Terminal Notification**: the one-time signal raised when a book transitions to ready or
  failed, used to inform the user without duplication.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any in-progress book, a user can correctly identify the current stage and
  the book's overall pipeline position (e.g., "stage 4 of 7") within 5 seconds of looking,
  without opening logs or developer tools.
- **SC-002**: While a book is actively processing, the on-screen progress never remains
  visually unchanged for more than 30 seconds; for batch stages, the unit count advances as
  work completes.
- **SC-003**: 100% of failed ingestions display the failing stage and a human-readable
  reason; a retry action is present for recoverable failures and absent for non-recoverable
  ones.
- **SC-004**: After retrying a recoverable failure, the run completes the remaining stages
  only — already-completed stages are not repeated — verifiable by stage transitions during
  the resumed run.
- **SC-005**: In a usability check, ≥ 95% of observers correctly distinguish the four
  high-level states — queued/waiting, processing, completed, and failed — for a given book.
- **SC-006**: Stages that complete instantly (cached/already-done) are visibly marked as
  completed/cached in 100% of cases, so rapid transitions are no longer mistaken for errors.
- **SC-007**: Ingestion progress remains correct and consistent across page refreshes and
  across all surfaces that display it (no contradictory states for the same book in 100% of
  observed cases).
- **SC-008**: The full ingestion lifecycle — start, multi-stage progress, completion, induced
  failure, and retry-resume — passes automated end-to-end browser tests with zero
  accessibility violations on the affected library views.

## Assumptions

- **Scope is observability, not pipeline redesign**: the existing seven-stage chain
  (download → clean → parse → chunk → summarize → embed → index) and its idempotent,
  resume-from-failed-stage guarantee are retained. The work is to emit richer progress
  signals and surface them clearly — not to add/remove/reorder stages or change what each
  stage computes.
- **Polling, not push**: live updates continue via the established polling mechanism at the
  2-second cadence (constitution: in-flight ingestion polling stays at 2s, no tighter); no
  new real-time transport (websockets/SSE) is introduced for this feature.
- **Reuse existing status persistence**: current/last stage, status, progress, start and
  completion timestamps, and error are already persisted per book; new sub-progress (units
  completed/total) and stage-completion markers extend this same persisted model rather than
  introducing a separate store.
- **Recoverability is stage-driven**: whether a failure can be retried is determined by the
  stage that failed (some stages are transient/retryable, others are not), consistent with
  the existing pipeline's error model.
- **Access control is unchanged**: per-user/library membership already governs who may view a
  book; this feature reuses that boundary for ingestion-status visibility (no new
  authorization model).
- **Language follows the user**: status labels and messages are presented in the interface
  language already used by the app (PT/EN), consistent with existing behavior.
- **Verification tooling is the existing stack**: acceptance is validated with the project's
  established end-to-end browser testing and accessibility checks for the web app; the
  "test everything" intent in the request is satisfied by E2E coverage of the ingestion
  lifecycle rather than ad-hoc manual checks.

## Dependencies

- The ingestion worker and queue must be running for end-to-end progress to be observable;
  local verification requires the full app stack (database, API, worker, and web) to be up.
- Deterministic local modes for the expensive stages (e.g., mock embedding/summary providers)
  are used so the ingestion lifecycle can be exercised end to end without external API
  nondeterminism.
