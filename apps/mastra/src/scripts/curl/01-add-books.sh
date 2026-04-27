#!/usr/bin/env bash
# 01-add-books.sh
# Adds Moby Dick (EN), Dom Casmurro (PT), and Crime and Punishment (EN) via
# Feature 001's catalog endpoints, triggers ingestion for each, and waits for
# every book to reach status='ready'. Exits non-zero if any book fails to
# reach 'ready' within INGESTION_TIMEOUT_SECONDS (default 600 = 10 minutes).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

require_jq

declare -a BOOK_GUTENDEX_IDS=(
  "${GUTENDEX_ID_MOBY_DICK}"
  "${GUTENDEX_ID_DOM_CASMURRO}"
  "${GUTENDEX_ID_CRIME_AND_PUNISHMENT}"
)
declare -a BOOK_LABELS=(
  "${BOOK_TITLE_MOBY_DICK}"
  "${BOOK_TITLE_DOM_CASMURRO}"
  "${BOOK_TITLE_CRIME_AND_PUNISHMENT}"
)

add_book() {
  local gutendex_id="$1"
  local label="$2"
  local idem_key
  idem_key="$(new_idempotency_key)"
  log "POST /api/library/books { gutendex_id: ${gutendex_id} } (${label})"
  local response
  response=$(curl --silent --show-error --max-time 30 \
    -w '\n__HTTP_STATUS__:%{http_code}\n' \
    -X POST "${API_BASE_URL}/api/library/books" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: ${idem_key}" \
    --data "{\"gutendex_id\": ${gutendex_id}}")
  local status
  status=$(printf '%s\n' "${response}" | awk -F: '/__HTTP_STATUS__/ { print $2 }')
  local body
  body=$(printf '%s\n' "${response}" | sed '/__HTTP_STATUS__/d')
  if [[ "${status}" != "201" && "${status}" != "200" && "${status}" != "409" ]]; then
    die "POST /api/library/books returned ${status}: ${body}"
  fi
  if [[ "${status}" == "409" ]]; then
    log "  → 409 (already in library); resolving id by title"
    resolve_book_id_by_title "${label}"
    return
  fi
  jq -r '.data.id' <<<"${body}"
}

trigger_ingestion() {
  local book_id="$1"
  local idem_key
  idem_key="$(new_idempotency_key)"
  log "POST /api/library/books/${book_id}/ingest"
  local response
  response=$(curl --silent --show-error --max-time 30 \
    -w '\n__HTTP_STATUS__:%{http_code}\n' \
    -X POST "${API_BASE_URL}/api/library/books/${book_id}/ingest" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: ${idem_key}")
  local status
  status=$(printf '%s\n' "${response}" | awk -F: '/__HTTP_STATUS__/ { print $2 }')
  if [[ "${status}" != "202" && "${status}" != "200" && "${status}" != "409" ]]; then
    local body
    body=$(printf '%s\n' "${response}" | sed '/__HTTP_STATUS__/d')
    die "POST /api/library/books/${book_id}/ingest returned ${status}: ${body}"
  fi
}

wait_until_ready() {
  local book_id="$1"
  local label="$2"
  local deadline
  deadline=$(( $(date +%s) + INGESTION_TIMEOUT_SECONDS ))
  while true; do
    local status
    status=$(get_ingestion_status "${book_id}")
    log "  ${label} (${book_id}) status=${status}"
    case "${status}" in
      ready) return 0 ;;
      failed) die "Ingestion failed for ${label} (${book_id}). Inspect /api/library/books/${book_id}/ingestion." ;;
    esac
    if (( $(date +%s) > deadline )); then
      die "Ingestion timed out for ${label} (${book_id}) after ${INGESTION_TIMEOUT_SECONDS}s. Last status=${status}."
    fi
    sleep "${INGESTION_POLL_INTERVAL_SECONDS}"
  done
}

declare -a BOOK_IDS=()
for i in "${!BOOK_GUTENDEX_IDS[@]}"; do
  id="$(add_book "${BOOK_GUTENDEX_IDS[${i}]}" "${BOOK_LABELS[${i}]}")"
  BOOK_IDS+=("${id}")
  log "→ ${BOOK_LABELS[${i}]} id=${id}"
done

for i in "${!BOOK_IDS[@]}"; do
  trigger_ingestion "${BOOK_IDS[${i}]}"
done

for i in "${!BOOK_IDS[@]}"; do
  wait_until_ready "${BOOK_IDS[${i}]}" "${BOOK_LABELS[${i}]}"
done

log "All 3 books reached status='ready'."
{
  printf 'moby_dick=%s\n' "${BOOK_IDS[0]}"
  printf 'dom_casmurro=%s\n' "${BOOK_IDS[1]}"
  printf 'crime_and_punishment=%s\n' "${BOOK_IDS[2]}"
} > "${TMP_DIR}/book_ids.env"
log "Wrote book ids to ${TMP_DIR}/book_ids.env"
