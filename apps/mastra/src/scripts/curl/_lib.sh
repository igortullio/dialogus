#!/usr/bin/env bash
# Shared helpers for the apps/mastra cURL smoke scripts.
# Sourced (not executed) by 01-add-books.sh through 05-empty-retrieval.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]:-$0}")" && pwd)"
TMP_DIR="${SCRIPT_DIR}/tmp"
mkdir -p "${TMP_DIR}"

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
MASTRA_BASE_URL="${MASTRA_BASE_URL:-http://localhost:3002}"
RESOURCE_ID="${RESOURCE_ID:-dialogus-owner}"

GUTENDEX_ID_MOBY_DICK="${GUTENDEX_ID_MOBY_DICK:-2701}"
GUTENDEX_ID_DOM_CASMURRO="${GUTENDEX_ID_DOM_CASMURRO:-55752}"
GUTENDEX_ID_CRIME_AND_PUNISHMENT="${GUTENDEX_ID_CRIME_AND_PUNISHMENT:-2554}"

BOOK_TITLE_MOBY_DICK="${BOOK_TITLE_MOBY_DICK:-Moby Dick}"
BOOK_TITLE_DOM_CASMURRO="${BOOK_TITLE_DOM_CASMURRO:-Dom Casmurro}"
BOOK_TITLE_CRIME_AND_PUNISHMENT="${BOOK_TITLE_CRIME_AND_PUNISHMENT:-Crime and Punishment}"

INGESTION_TIMEOUT_SECONDS="${INGESTION_TIMEOUT_SECONDS:-600}"
INGESTION_POLL_INTERVAL_SECONDS="${INGESTION_POLL_INTERVAL_SECONDS:-5}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

require_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required. Install with 'brew install jq' or your package manager."
}

new_idempotency_key() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    python3 -c 'import uuid; print(uuid.uuid4())'
  fi
}

# Resolves a book id by title substring (case-insensitive).
# Echoes the matched book id, or exits non-zero if not found.
resolve_book_id_by_title() {
  local title_substring="$1"
  local response
  response=$(curl --silent --show-error --fail --max-time 15 \
    "${API_BASE_URL}/api/library/books?limit=50" \
    || die "GET /api/library/books?limit=50 failed (is apps/api running on ${API_BASE_URL}?)")
  local id
  id=$(jq --arg q "${title_substring}" -r '
    .data[] | select(.title | ascii_downcase | contains($q | ascii_downcase)) | .id
  ' <<<"${response}" | head -n 1)
  if [[ -z "${id}" || "${id}" == "null" ]]; then
    die "Could not resolve book id matching title substring '${title_substring}' in /api/library/books"
  fi
  printf '%s' "${id}"
}

# Returns the ingestion status string ('discovered', 'embedding', 'ready', 'failed', ...).
get_ingestion_status() {
  local book_id="$1"
  local response
  response=$(curl --silent --show-error --fail --max-time 15 \
    "${API_BASE_URL}/api/library/books/${book_id}/ingestion" \
    || die "GET /api/library/books/${book_id}/ingestion failed")
  jq -r '.data.status' <<<"${response}"
}

# Streams an agent response and tees it to a file under TMP_DIR. Echoes the file path.
stream_agent_response() {
  local thread_id="$1"
  local payload_path="$2"
  local out_path="$3"
  curl --silent --show-error --fail --max-time 180 -N \
    -X POST "${MASTRA_BASE_URL}/api/agents/dialogusAgent/stream" \
    -H 'Content-Type: application/json' \
    --data "@${payload_path}" \
    | tee "${out_path}" >/dev/null \
    || die "POST /api/agents/dialogusAgent/stream (thread ${thread_id}) failed"
  printf '%s' "${out_path}"
}

# Extracts unique citation marker UUIDs (one per line) from a captured SSE response file.
extract_citation_uuids() {
  local file="$1"
  grep -oE '\{\{cite:[0-9a-f-]{36}\}\}' "${file}" \
    | sed -E 's/\{\{cite:([0-9a-f-]{36})\}\}/\1/' \
    | sort -u
}

# GET the chunk endpoint for a chunk id and echoes its chapter_ordinal.
fetch_chunk_chapter_ordinal() {
  local chunk_id="$1"
  local response
  response=$(curl --silent --show-error --fail --max-time 15 \
    "${API_BASE_URL}/api/library/chunks/${chunk_id}" \
    || die "GET /api/library/chunks/${chunk_id} failed (citation marker points at unknown chunk)")
  jq -r '.data.chapter_ordinal' <<<"${response}"
}
