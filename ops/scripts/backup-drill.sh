#!/usr/bin/env bash
# ----------------------------------------------------------------------------
#  ซ้อมการสำรองและกู้คืนข้อมูล — พิสูจน์ว่าไฟล์สำรองข้อมูลกู้คืนได้จริง
#
#  ขั้นตอน
#    1. สำรองข้อมูล
#    2. ลบข้อมูลบางส่วนออกจากฐานข้อมูลโดยเจตนา
#    3. กู้คืนจากไฟล์สำรองข้อมูลล่าสุด
#    4. ตรวจว่าข้อมูลกลับมาครบ 16 กิจกรรมเหมือนเดิม
# ----------------------------------------------------------------------------
set -euo pipefail

# อ่านค่าตั้งค่าจาก .env ของ compose (ถ้ามี)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

psql_exec() {
  docker compose exec -T db psql -U "${POSTGRES_USER:-app_user}" -d "${POSTGRES_DB:-psu_activities}" -tAc "$1"
}

echo "1) สำรองข้อมูล"
docker compose exec -T backup backup.sh

BEFORE="$(psql_exec 'SELECT COUNT(*) FROM activities;')"
echo "   จำนวนกิจกรรมก่อนทดสอบ: ${BEFORE}"

echo "2) ลบข้อมูลออกโดยเจตนาเพื่อจำลองเหตุข้อมูลสูญหาย"
psql_exec 'DELETE FROM activities WHERE id > 8;' > /dev/null
AFTER_DELETE="$(psql_exec 'SELECT COUNT(*) FROM activities;')"
echo "   จำนวนกิจกรรมหลังลบ: ${AFTER_DELETE}"

if [ "${AFTER_DELETE}" = "${BEFORE}" ]; then
  echo "   การลบข้อมูลไม่เกิดผล — การทดสอบไม่สมบูรณ์" >&2
  exit 1
fi

echo "3) กู้คืนจากไฟล์สำรองข้อมูลล่าสุด"
docker compose exec -T -e CONFIRM=yes backup restore.sh latest

RESTORED="$(psql_exec 'SELECT COUNT(*) FROM activities;')"
echo "   จำนวนกิจกรรมหลังกู้คืน: ${RESTORED}"

echo "4) ตรวจสอบผล"
if [ "${RESTORED}" = "${BEFORE}" ]; then
  echo "การสำรองและกู้คืนข้อมูลทำงานถูกต้อง (${BEFORE} -> ${AFTER_DELETE} -> ${RESTORED})"
else
  echo "กู้คืนข้อมูลไม่ครบ คาดว่า ${BEFORE} แต่ได้ ${RESTORED}" >&2
  exit 1
fi
