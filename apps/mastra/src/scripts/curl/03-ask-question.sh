#!/usr/bin/env bash
# 03-ask-question.sh
# Asks "where does Ishmael first meet Queequeg?" on the Moby Dick thread,
# captures the SSE response, asserts at least one {{cite:<uuid>}} marker,
# and verifies the marker's chunk via GET /api/library/chunks/:id.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

require_jq

[[ -f "${TMP_DIR}/thread_id" ]] || die "Missing ${TMP_DIR}/thread_id — run 02-create-thread.sh first."
thread_id=$(<"${TMP_DIR}/thread_id")
log "Using thread_id=${thread_id}"

moby_dick_id="$(resolve_book_id_by_title "${BOOK_TITLE_MOBY_DICK}")"
log "Moby Dick id=${moby_dick_id}"

payload_path="${TMP_DIR}/03-ask-question.payload.json"
jq -n \
  --arg thread_id "${thread_id}" \
  --arg resource_id "${RESOURCE_ID}" \
  --arg book_id "${moby_dick_id}" \
  --arg msg "Where does Ishmael first meet Queequeg? Search only book_ids=[\"${moby_dick_id}\"]." \
  '{
     messages: [{ role: "user", content: $msg }],
     threadId: $thread_id,
     resourceId: $resource_id,
     requestContext: { book_ids: [$book_id] }
   }' \
  > "${payload_path}"

out_path="${TMP_DIR}/03-ask-question.sse.txt"
log "POST /api/agents/dialogusAgent/stream → ${out_path}"
stream_agent_response "${thread_id}" "${payload_path}" "${out_path}" >/dev/null

mapfile -t citations < <(extract_citation_uuids "${out_path}")
log "Found ${#citations[@]} unique citation marker(s)."

if (( ${#citations[@]} == 0 )); then
  die "Expected at least one {{cite:<uuid>}} marker; got none. See ${out_path}."
fi

first_chunk_id="${citations[0]}"
log "Verifying first citation chunk_id=${first_chunk_id} resolves via /api/library/chunks/:id"
ordinal="$(fetch_chunk_chapter_ordinal "${first_chunk_id}")"
log "  → chunk resolved (chapter_ordinal=${ordinal})."

log "OK — ${#citations[@]} citation(s) emitted; first chunk verified."
