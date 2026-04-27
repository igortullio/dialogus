#!/usr/bin/env bash
# 04-spoiler-cap.sh
# Creates a fresh thread on Moby Dick and asks "how does Ahab die?" with a
# spoiler cap of chapter 10. Asserts the response either:
#   (a) contains no {{cite:...}} marker (refusal), OR
#   (b) contains markers only pointing at chunks with chapter_ordinal <= 10.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

require_jq

SPOILER_CAP_ORDINAL="${SPOILER_CAP_ORDINAL:-10}"

moby_dick_id="$(resolve_book_id_by_title "${BOOK_TITLE_MOBY_DICK}")"
log "Moby Dick id=${moby_dick_id}; spoiler cap ordinal=${SPOILER_CAP_ORDINAL}"

thread_payload_path="${TMP_DIR}/04-spoiler-cap.thread.json"
jq -n \
  --arg resource_id "${RESOURCE_ID}" \
  --arg title "Moby Dick — spoiler cap chapter ${SPOILER_CAP_ORDINAL}" \
  --arg book_id "${moby_dick_id}" \
  --argjson cap "${SPOILER_CAP_ORDINAL}" \
  '{
     resourceId: $resource_id,
     title: $title,
     metadata: { book_ids: [$book_id], spoiler_caps: { ($book_id): $cap } }
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

stream_payload_path="${TMP_DIR}/04-spoiler-cap.payload.json"
jq -n \
  --arg thread_id "${thread_id}" \
  --arg resource_id "${RESOURCE_ID}" \
  --arg book_id "${moby_dick_id}" \
  --argjson cap "${SPOILER_CAP_ORDINAL}" \
  --arg msg "I'm only on chapter ${SPOILER_CAP_ORDINAL} of Moby Dick. Honour spoiler_caps={\"${moby_dick_id}\":${SPOILER_CAP_ORDINAL}}. How does Ahab die?" \
  '{
     messages: [{ role: "user", content: $msg }],
     threadId: $thread_id,
     resourceId: $resource_id,
     requestContext: { book_ids: [$book_id], spoiler_caps: { ($book_id): $cap } }
   }' \
  > "${stream_payload_path}"

out_path="${TMP_DIR}/04-spoiler-cap.sse.txt"
log "POST /api/agents/dialogusAgent/stream → ${out_path}"
stream_agent_response "${thread_id}" "${stream_payload_path}" "${out_path}" >/dev/null

mapfile -t citations < <(extract_citation_uuids "${out_path}")
log "Found ${#citations[@]} citation marker(s)."

if (( ${#citations[@]} == 0 )); then
  log "OK — agent refused to cite (zero markers under spoiler cap)."
  exit 0
fi

violations=()
for chunk_id in "${citations[@]}"; do
  ordinal="$(fetch_chunk_chapter_ordinal "${chunk_id}")"
  if (( ordinal > SPOILER_CAP_ORDINAL )); then
    violations+=("${chunk_id}@chapter_ordinal=${ordinal}")
  fi
done

if (( ${#violations[@]} > 0 )); then
  log "Citations violating spoiler cap (${SPOILER_CAP_ORDINAL}):"
  for v in "${violations[@]}"; do log "  - ${v}"; done
  die "Spoiler cap violation: ${#violations[@]} citation(s) point above ordinal ${SPOILER_CAP_ORDINAL}. See ${out_path}."
fi

log "OK — ${#citations[@]} citation(s) all within ordinal ≤ ${SPOILER_CAP_ORDINAL}."
