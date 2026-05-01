# Chat UI screencast (Feature 004)

A 3-minute portfolio screencast covering the four user journeys defined in
`.compozy/tasks/004-chat-ui/_prd.md` — search → ingest → ask → spoiler-safe read.

## Status

- **Recording:** captured on the owner's machine during real dogfood with
  Anthropic + OpenAI keys (mock providers cannot demonstrate the citation /
  retrieval quality the screencast is meant to show).
- **Storage:** committed as `docs/screencast.mp4` once recorded; if file size
  exceeds 25 MB, replaced by a link to an external host (YouTube unlisted /
  Loom) and that URL recorded both here and in the root README.

When the recording is published, replace this paragraph with the link and
any owner notes (recording tool, duration, recording date).

## Scene-by-scene script (≈ 3:00 total)

| Time | Scene | What to capture |
|------|-------|-----------------|
| 0:00–0:20 | **Cold open** — `localhost:3000`, dark mode | Empty sidebar; "Primeiros passos" card with three covers (Monte Cristo, Brás Cubas, Crime and Punishment). |
| 0:20–0:50 | **Ingest** — click "Adicionar e ingerir" on Brás Cubas | Cut to `/library` mid-ingest to show progress bar through `parsing → chunking → summarizing → embedding`. Cut back when `ready`. |
| 0:50–1:30 | **Ask** — "Quem é o narrador?" | First token visible ≤ 3 s, full response ≤ 15 s. Citation badges appear inline as the stream lands. Hover one to surface the tooltip; click to open the side panel with the full passage. |
| 1:30–2:10 | **Spoiler cap** — open chip popover, drag slider to cap. 3 | Popover closes; chip updates to "Cap. ≤ 3". Send "o que acontece no capítulo 5?" — verify all citations reference chapters ≤ 3 (or refusal-with-hints). |
| 2:10–2:35 | **Library polish** — `/library`, "Adicionar do Gutendex" | Search "Tolstoy", show results, add War and Peace, return to grid showing the new card as `discovered → downloading`. |
| 2:35–3:00 | **Thread management** — rename, pin, delete | Three-dot menu → rename → "Memorias deep dive". Pin. Delete a test thread. Refresh; pin + rename persist. |

## Recording checklist

- [ ] OBS / QuickTime recording at 1280×800 minimum, 30 fps.
- [ ] System set to dark mode (matches the screenshots).
- [ ] DevTools closed; clean profile (no extension chrome).
- [ ] All 6 README screenshots captured fresh from the same recording session
  (replacing the placeholder mockups in `docs/screenshots/`).
- [ ] Audio: silent or single-line voiceover at start ("dIAlogus — chat-first
  RAG study companion. Three minutes."). No background music.
- [ ] Final cut compressed to ≤ 25 MB H.264; fall back to external host if
  larger.
- [ ] Recording tool noted in this doc + the root README "Chat UI" section.

## Why placeholder screenshots ship before the screencast

The 6 PNGs under `docs/screenshots/` are visual mockups rendered with the
project's exact design tokens (see `apps/web/src/app/globals.css`) by
`docs/screenshots/_render-mockups.mjs`. They communicate the layout, the
information density, and the visual language to a portfolio reviewer scanning
the README in 30 seconds. The screencast then carries the live demo work —
citations resolving in real time, ingestion progress flowing, the spoiler cap
silently bounding retrieval — that a static image cannot show.

Once the screencast is captured the owner replaces these mockups with real
screen captures from the same session.
