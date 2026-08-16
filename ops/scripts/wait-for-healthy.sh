#!/usr/bin/env bash
# ----------------------------------------------------------------------------
#  รอจนกว่าทุก container ที่มี healthcheck จะมีสถานะ healthy
#  ใช้:  ./ops/scripts/wait-for-healthy.sh [วินาทีที่ยอมรอสูงสุด]
# ----------------------------------------------------------------------------
set -euo pipefail

TIMEOUT="${1:-180}"
INTERVAL=3
ELAPSED=0

echo "รอให้บริการทั้งหมดพร้อมใช้งาน (สูงสุด ${TIMEOUT} วินาที)..."

while [ "${ELAPSED}" -lt "${TIMEOUT}" ]; do
  UNHEALTHY=0
  PENDING=""

  for CID in $(docker compose ps -q); do
    NAME="$(docker inspect -f '{{.Name}}' "${CID}" | sed 's|^/||')"
    STATE="$(docker inspect -f '{{.State.Status}}' "${CID}")"
    HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CID}")"

    if [ "${HEALTH}" = "none" ]; then
      # ไม่มี healthcheck — ขอแค่ยังทำงานอยู่
      [ "${STATE}" = "running" ] || { UNHEALTHY=1; PENDING="${PENDING} ${NAME}(${STATE})"; }
    elif [ "${HEALTH}" != "healthy" ]; then
      UNHEALTHY=1
      PENDING="${PENDING} ${NAME}(${HEALTH})"
    fi
  done

  if [ "${UNHEALTHY}" -eq 0 ]; then
    echo "บริการทั้งหมดพร้อมใช้งานแล้ว (ใช้เวลา ${ELAPSED} วินาที)"
    docker compose ps
    exit 0
  fi

  echo "  ยังไม่พร้อม:${PENDING}"
  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "หมดเวลารอ — ยังมีบริการที่ไม่พร้อมใช้งาน" >&2
docker compose ps
exit 1
