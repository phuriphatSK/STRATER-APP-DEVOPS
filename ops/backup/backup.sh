#!/bin/sh
# ----------------------------------------------------------------------------
#  สำรองฐานข้อมูล PostgreSQL เป็นไฟล์ custom format (.dump) พร้อม checksum
#  - ตั้งชื่อไฟล์ตามวันเวลา
#  - ตรวจสอบความสมบูรณ์ของไฟล์ด้วย pg_restore --list
#  - ลบไฟล์ที่เก่ากว่า BACKUP_RETENTION_DAYS วัน
# ----------------------------------------------------------------------------
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
DB="${PGDATABASE:-psu_activities}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/${DB}-${STAMP}.dump"

log() {
  echo "{\"level\":\"$1\",\"service\":\"backup\",\"time\":\"$(date -Iseconds)\",\"message\":\"$2\"}"
}

mkdir -p "${BACKUP_DIR}"

log info "เริ่มสำรองข้อมูล ${DB} -> $(basename "${FILE}")"

# -Fc = custom format (บีบอัดในตัว, กู้คืนแบบเลือกตารางได้)
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="${FILE}.tmp"; then
  log error "pg_dump ล้มเหลว"
  rm -f "${FILE}.tmp"
  exit 1
fi

# ตรวจสอบว่าไฟล์ที่ได้อ่านได้จริง ก่อนถือว่าสำเร็จ
if ! pg_restore --list "${FILE}.tmp" > /dev/null 2>&1; then
  log error "ไฟล์สำรองข้อมูลเสียหาย (pg_restore --list ไม่ผ่าน)"
  rm -f "${FILE}.tmp"
  exit 1
fi

mv "${FILE}.tmp" "${FILE}"
sha256sum "${FILE}" | awk '{print $1}' > "${FILE}.sha256"

SIZE="$(du -h "${FILE}" | awk '{print $1}')"
log info "สำรองข้อมูลสำเร็จ ไฟล์ $(basename "${FILE}") ขนาด ${SIZE}"

# ---- ลบไฟล์เก่าตามนโยบายการเก็บรักษา ----
DELETED="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${DB}-*.dump*" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
if [ "${DELETED}" -gt 0 ]; then
  log info "ลบไฟล์สำรองข้อมูลที่เก่ากว่า ${RETENTION_DAYS} วัน จำนวน ${DELETED} ไฟล์"
fi

REMAIN="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${DB}-*.dump" | wc -l)"
log info "ขณะนี้มีไฟล์สำรองข้อมูลทั้งหมด ${REMAIN} ไฟล์"
