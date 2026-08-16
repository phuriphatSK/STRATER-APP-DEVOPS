#!/bin/sh
# ----------------------------------------------------------------------------
#  ตั้งตารางเวลาสำรองข้อมูล แล้วรัน crond ค้างไว้เป็น process หลักของ container
# ----------------------------------------------------------------------------
set -eu

BACKUP_CRON="${BACKUP_CRON:-0 2 * * *}"
BACKUP_ON_START="${BACKUP_ON_START:-true}"

log() { echo "{\"level\":\"info\",\"service\":\"backup\",\"time\":\"$(date -Iseconds)\",\"message\":\"$1\"}"; }

# เก็บค่าตั้งค่าไว้ให้ process ของ cron อ่านได้ (cron ไม่สืบทอด environment)
{
  echo "export PGHOST='${PGHOST:-db}'"
  echo "export PGPORT='${PGPORT:-5432}'"
  echo "export PGDATABASE='${PGDATABASE:-psu_activities}'"
  echo "export PGUSER='${PGUSER:-app_user}'"
  echo "export PGPASSWORD='${PGPASSWORD:-}'"
  echo "export BACKUP_RETENTION_DAYS='${BACKUP_RETENTION_DAYS:-7}'"
  echo "export BACKUP_DIR='${BACKUP_DIR:-/backups}'"
} > /etc/backup.env
chmod 600 /etc/backup.env

# ตารางเวลา: ส่ง log ของงานสำรองข้อมูลออก stdout ของ container
echo "${BACKUP_CRON} . /etc/backup.env && /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

log "ตั้งตารางสำรองข้อมูลแล้ว (cron: ${BACKUP_CRON}, เก็บย้อนหลัง ${BACKUP_RETENTION_DAYS:-7} วัน)"

if [ "${BACKUP_ON_START}" = "true" ]; then
  log "สำรองข้อมูลรอบแรกทันทีที่เริ่มทำงาน"
  . /etc/backup.env && /usr/local/bin/backup.sh || log "การสำรองข้อมูลรอบแรกไม่สำเร็จ (ระบบจะลองใหม่ตามรอบเวลา)"
fi

exec crond -f -l 8
