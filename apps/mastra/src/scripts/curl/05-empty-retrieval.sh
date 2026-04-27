#!/usr/bin/env bash
# 05-empty-retrieval.sh
# Creates a thread scoped to Dom Casmurro, asks an off-topic question
# ("qual o papel dos gnomos em Dom Casmurro?"), asserts:
#   (a) no {{cite:...}} marker is emitted,
#   (b) at least 2 lines start with "- " or "* " (reformulation hints, ADR-003).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

require_jq

dom_casmurro_id="$(resolve_book_id_by_title "${BOOK_TITLE_DOM_CASMURRO}")"
log "Dom Casmurro id=${dom_casmurro_id}"

thread_payload_path="${TMP_DIR}/05-empty-retrieval.thread.json"
jq -n \
  --arg resource_id "${RESOURCE_ID}" \
  --arg title "Dom Casmurro — empty retrieval smoke" \
  --arg book_id "${dom_casmurro_id}" \
  '{
     resourceId: $resource_id,
     title: $title,
     metadata: { book_ids: [$book_id] }
   }' \
  > "${thread_payload_path}"

log "POST /api/memory/threads"
thread_response=$(curl --silent --show-error --fail --max-time 30 \
  -X POST "${MASTRA_BASE_URL}/api/memory/threads" \
  -H 'Content-Type: application/json' \
  --data "@${thread_payload_path}" \
  || die "POST /api/memory/threads failed")
thread_id=$(jq -r '.id // .thread.id // empty' <<<"${thread_response}")
[[ -n "${thread_id}" ]] || die "Could not extract thread id from response: ${thread_response}"
log "Thread created: ${thread_id}"

stream_payload_path="${TMP_DIR}/05-empty-retrieval.payload.json"
jq -n \
  --arg thread_id "${thread_id}" \
  --arg resource_id "${RESOURCE_ID}" \
  --arg book_id "${dom_casmurro_id}" \
  --arg msg "Qual o papel dos gnomos em Dom Casmurro?" \
  '{
     messages: [{ role: "user", content: $msg }],
     threadId: $thread_id,
     resourceId: $resource_id,
     requestContext: { book_ids: [$book_id] }
   }' \
  > "${stream_payload_path}"

out_path="${TMP_DIR}/05-empty-retrieval.sse.txt"
log "POST /api/agents/dialogusAgent/stream → ${out_path}"
stream_agent_response "${thread_id}" "${stream_payload_path}" "${out_path}" >/dev/null

mapfile -t citations < <(extract_citation_uuids "${out_path}")
log "Found ${#citations[@]} citation marker(s) (expected 0)."
if (( ${#citations[@]} != 0 )); then
  die "Expected refusal with zero citations, got ${#citations[@]}. See ${out_path}."
fi

# Count lines starting with "- " or "* " (markdown bullet list — reformulation hints).
hint_count=$(grep -cE '^[[:space:]]*[-*][[:space:]]+' "${out_path}" || true)
log "Reformulation hint lines: ${hint_count}"
if (( hint_count < 2 )); then
  die "Expected ≥2 reformulation hint lines (lines starting with '- ' or '* '); got ${hint_count}. See ${out_path}."
fi

log "OK — refusal with ${hint_count} reformulation hint line(s) and zero citations."
