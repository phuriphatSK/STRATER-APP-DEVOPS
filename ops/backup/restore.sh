#!/bin/sh
# ----------------------------------------------------------------------------
#  กู้คืนฐานข้อมูลจากไฟล์สำรองข้อมูล
#
#  วิธีใช้ (รันจากเครื่อง host):
#    docker compose exec backup restore.sh /backups/psu_activities-20260813-020000.dump
#    docker compose exec backup restore.sh latest      # ใช้ไฟล์ล่าสุด
#
#  ต้องยืนยันด้วย CONFIRM=yes เพราะข้อมูลเดิมจะถูกเขียนทับ
#    docker compose exec -e CONFIRM=yes backup restore.sh latest
# ----------------------------------------------------------------------------
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB="${PGDATABASE:-psu_activities}"
TARGET="${1:-latest}"

log() {
  echo "{\"level\":\"$1\",\"service\":\"restore\",\"time\":\"$(date -Iseconds)\",\"message\":\"$2\"}"
}

if [ "${TARGET}" = "latest" ]; then
  TARGET="$(ls -1t "${BACKUP_DIR}"/"${DB}"-*.dump 2>/dev/null | head -n 1 || true)"
fi

if [ -z "${TARGET}" ] || [ ! -f "${TARGET}" ]; then
  log error "ไม่พบไฟล์สำรองข้อมูลที่ระบุ (${TARGET:-ไม่มีไฟล์ใน ${BACKUP_DIR}})"
  exit 1
fi

# ตรวจ checksum ถ้ามีไฟล์กำกับไว้
if [ -f "${TARGET}.sha256" ]; then
  EXPECTED="$(cat "${TARGET}.sha256")"
  ACTUAL="$(sha256sum "${TARGET}" | awk '{print $1}')"
  if [ "${EXPECTED}" != "${ACTUAL}" ]; then
    log error "checksum ไม่ตรง ไฟล์สำรองข้อมูลอาจเสียหาย"
    exit 1
  fi
  log info "ตรวจสอบ checksum ผ่าน"
fi

if [ "${CONFIRM:-no}" != "yes" ]; then
  log error "ข้อมูลปัจจุบันในฐานข้อมูล ${DB} จะถูกเขียนทับ — สั่งซ้ำโดยกำหนด CONFIRM=yes เพื่อยืนยัน"
  exit 2
fi

log info "เริ่มกู้คืนฐานข้อมูล ${DB} จากไฟล์ $(basename "${TARGET}")"

# --clean --if-exists : ลบ object เดิมก่อนสร้างใหม่ ทำให้กู้คืนทับของเดิมได้
pg_restore --dbname="${DB}" --clean --if-exists --no-owner --no-privileges --exit-on-error "${TARGET}"

log info "กู้คืนฐานข้อมูลสำเร็จ"

# แสดงจำนวนแถวไว้ตรวจสอบผลลัพธ์
psql --dbname="${DB}" --tuples-only --command \
  "SELECT 'activities=' || (SELECT COUNT(*) FROM activities) || ' registrations=' || (SELECT COUNT(*) FROM registrations);"
