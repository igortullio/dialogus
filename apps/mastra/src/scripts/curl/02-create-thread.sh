#!/usr/bin/env bash
# 02-create-thread.sh
# Creates a Mastra thread scoped to Moby Dick and writes thread_id to ./tmp/thread_id.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

require_jq

log "Resolving '${BOOK_TITLE_MOBY_DICK}' book id"
moby_dick_id="$(resolve_book_id_by_title "${BOOK_TITLE_MOBY_DICK}")"
log "  → ${moby_dick_id}"

log "POST /api/memory/threads (resourceId=${RESOURCE_ID})"
payload_path="${TMP_DIR}/02-create-thread.payload.json"
jq -n \
  --arg resource_id "${RESOURCE_ID}" \
  --arg title "Moby Dick smoke thread" \
  --arg book_id "${moby_dick_id}" \
  '{ resourceId: $resource_id, title: $title, metadata: { book_ids: [$book_id] } }' \
  > "${payload_path}"

response=$(curl --silent --show-error --fail --max-time 30 \
  -X POST "${MASTRA_BASE_URL}/api/memory/threads" \
  -H 'Content-Type: application/json' \
  --data "@${payload_path}" \
  || die "POST /api/memory/threads failed (is apps/mastra running on ${MASTRA_BASE_URL}?)")

thread_id=$(jq -r '.id // .thread.id // empty' <<<"${response}")
if [[ -z "${thread_id}" ]]; then
  die "Could not extract thread id from response: ${response}"
fi

printf '%s\n' "${thread_id}" > "${TMP_DIR}/thread_id"
log "Thread created: ${thread_id} (saved to ${TMP_DIR}/thread_id)"
