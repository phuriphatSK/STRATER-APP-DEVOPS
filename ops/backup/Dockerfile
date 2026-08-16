# ============================================================================
#  Container สำรองข้อมูล PostgreSQL อัตโนมัติ
#  ใช้ crond ของ BusyBox เรียก backup.sh ตามรอบเวลาที่กำหนดด้วย BACKUP_CRON
# ============================================================================
FROM postgres:16-alpine

# ใช้ postgres image เพื่อให้เวอร์ชันของ pg_dump ตรงกับเซิร์ฟเวอร์เสมอ
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh \
    && mkdir -p /backups

VOLUME ["/backups"]

HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD pgrep crond > /dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
