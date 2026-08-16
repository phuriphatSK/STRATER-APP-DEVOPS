#!/usr/bin/env sh
# ----------------------------------------------------------------------------
#  สร้างไฟล์ .env จากไฟล์ต้นฉบับ พร้อมสุ่มรหัสผ่านที่แข็งแรงให้อัตโนมัติ
#  ใช้:  ./ops/scripts/init-env.sh
#
#  ถ้ามีไฟล์ .env อยู่แล้วจะไม่เขียนทับ (กันรหัสผ่านของระบบที่ใช้งานอยู่หาย)
# ----------------------------------------------------------------------------
set -eu

if [ -f .env ]; then
  echo "มีไฟล์ .env อยู่แล้ว — ไม่เขียนทับ"
  echo "หากต้องการสร้างใหม่ ให้ลบหรือเปลี่ยนชื่อไฟล์เดิมก่อน"
  exit 0
fi

# สุ่มรหัสผ่าน 24 อักขระ (ใช้ได้ทั้ง Linux / macOS / Git Bash โดยไม่ต้องพึ่ง openssl)
random_password() {
  head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-24
}

PG_PW="$(random_password)"
GF_PW="$(random_password)"

cp .env.example .env

# sed -i.bak แล้วลบไฟล์สำรอง เพื่อให้ทำงานได้ทั้ง GNU sed และ BSD sed (macOS)
sed -i.bak \
  -e "s|^PGPASSWORD=.*|PGPASSWORD=${PG_PW}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PW}|" \
  -e "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=${GF_PW}|" \
  .env
rm -f .env.bak

chmod 600 .env 2>/dev/null || true

echo "สร้างไฟล์ .env พร้อมสุ่มรหัสผ่านเรียบร้อย"
echo "--------------------------------------------------"
echo "  รหัสผ่านฐานข้อมูล : ${PG_PW}"
echo "  Grafana           : admin / ${GF_PW}"
echo "--------------------------------------------------"
echo "ไฟล์ .env ถูก .gitignore ไว้แล้ว จะไม่ถูก commit ขึ้น Repository"

# เตือนกรณีเคยรันระบบนี้มาก่อน: PostgreSQL จะไม่ตั้งรหัสผ่านใหม่ให้ volume เดิม
# ทำให้ Back-end เชื่อมต่อไม่ได้ด้วยข้อความ password authentication failed
if docker volume ls --format '{{.Name}}' 2>/dev/null | grep -q '^psu-activities_pgdata$'; then
  echo ""
  echo "⚠  พบ volume ฐานข้อมูลเดิม (psu-activities_pgdata) อยู่บนเครื่องนี้แล้ว"
  echo "   PostgreSQL จะยังใช้รหัสผ่านเดิมของ volume นั้น ไม่ใช่รหัสที่เพิ่งสุ่มให้"
  echo "   หากต้องการเริ่มใหม่ทั้งหมด (ข้อมูลเดิมจะหายไป) ให้สั่ง:"
  echo "     docker compose --profile monitoring down -v"
fi
