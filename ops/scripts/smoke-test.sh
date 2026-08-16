#!/usr/bin/env bash
# ----------------------------------------------------------------------------
#  ทดสอบการทำงานของระบบหลังนำขึ้น (Smoke Test)
#  ยิงผ่าน Reverse Proxy เท่านั้น เพื่อพิสูจน์ว่าเส้นทาง web -> backend -> db ใช้ได้จริง
#
#  ใช้:  ./ops/scripts/smoke-test.sh [BASE_URL]     ค่าเริ่มต้น http://localhost:8080
# ----------------------------------------------------------------------------
set -uo pipefail

BASE="${1:-http://localhost:8080}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "${actual}" = "${expected}" ]; then
    echo "  [ผ่าน] ${name} (${actual})"
    PASS=$((PASS + 1))
  else
    echo "  [ไม่ผ่าน] ${name} — คาดว่า ${expected} แต่ได้ ${actual}" >&2
    FAIL=$((FAIL + 1))
  fi
}

contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "${haystack}" | grep -q -- "${needle}"; then
    echo "  [ผ่าน] ${name}"
    PASS=$((PASS + 1))
  else
    echo "  [ไม่ผ่าน] ${name} — ไม่พบ '${needle}' ในผลลัพธ์" >&2
    echo "         ผลลัพธ์: $(printf '%s' "${haystack}" | head -c 300)" >&2
    FAIL=$((FAIL + 1))
  fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$1"; }

echo "ทดสอบระบบที่ ${BASE}"

echo "1) หน้าเว็บ Front-end"
check "GET /" "200" "$(status_of "${BASE}/")"
contains "หน้าเว็บมีชื่อระบบ" "กิจกรรมพัฒนานักศึกษา" "$(curl -s "${BASE}/")"

echo "2) Reverse Proxy และสถานะระบบ"
check "GET /healthz (nginx)" "200" "$(status_of "${BASE}/healthz")"
check "GET /api/health" "200" "$(status_of "${BASE}/api/health")"
HEALTH="$(curl -s "${BASE}/api/health")"
contains "สถานะระบบเป็น ok" '"status":"ok"' "${HEALTH}"
contains "เชื่อมต่อฐานข้อมูลได้" '"database":"up"' "${HEALTH}"

echo "3) ข้อมูลกิจกรรม (พิสูจน์ว่าอ่านจากฐานข้อมูลจริง)"
ACTIVITIES="$(curl -s "${BASE}/api/activities?page=1&limit=9")"
contains "มีข้อมูลกิจกรรมครบ 16 รายการ" '"total":16' "${ACTIVITIES}"
check "GET /api/activities/1" "200" "$(status_of "${BASE}/api/activities/1")"
check "GET /api/activities/99999 ต้องเป็น 404" "404" "$(status_of "${BASE}/api/activities/99999")"
check "GET /api/activities/abc ต้องเป็น 400" "400" "$(status_of "${BASE}/api/activities/abc")"

echo "4) ประเภทกิจกรรมและการค้นหา"
contains "มีประเภทกิจกรรม" '"data"' "$(curl -s "${BASE}/api/categories")"
contains "ค้นหาคำว่า อาสา ได้ผลลัพธ์" '"id"' "$(curl -s "${BASE}/api/activities?q=%E0%B8%AD%E0%B8%B2%E0%B8%AA%E0%B8%B2")"

echo "5) การลงทะเบียน (เขียนข้อมูลลงฐานข้อมูล)"
SID="65$(date +%s | tail -c 9)"
BODY="{\"fullName\":\"ผู้ทดสอบ ระบบ\",\"studentId\":\"${SID}\",\"faculty\":\"คณะวิศวกรรมศาสตร์\",\"email\":\"smoke@example.com\",\"phone\":\"0812345678\",\"activityId\":1,\"consent\":true}"
CREATE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/registrations" -H 'Content-Type: application/json' -d "${BODY}")"
check "POST /api/registrations" "201" "${CREATE_STATUS}"

DUP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/registrations" -H 'Content-Type: application/json' -d "${BODY}")"
check "ลงทะเบียนซ้ำต้องถูกปฏิเสธ" "409" "${DUP_STATUS}"

BAD_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/registrations" -H 'Content-Type: application/json' -d '{"fullName":""}')"
check "ข้อมูลไม่ครบต้องถูกปฏิเสธ" "400" "${BAD_STATUS}"

REGS="$(curl -s "${BASE}/api/registrations?activityId=1")"
contains "อ่านรายชื่อผู้ลงทะเบียนได้" "${SID}" "${REGS}"
contains "อีเมลถูกปิดบังบางส่วน" '\*' "${REGS}"

echo "6) เส้นทางที่ไม่มีอยู่จริง"
check "GET /api/ไม่มีเส้นทางนี้" "404" "$(status_of "${BASE}/api/no-such-endpoint")"

echo "----------------------------------------"
echo "ผลการทดสอบ: ผ่าน ${PASS} รายการ / ไม่ผ่าน ${FAIL} รายการ"
[ "${FAIL}" -eq 0 ] || exit 1
echo "ระบบทำงานได้ครบถ้วน"
