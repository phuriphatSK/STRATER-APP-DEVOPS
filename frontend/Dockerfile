# ============================================================================
#  Front-end (HTML/CSS/JS ล้วน) ให้บริการด้วย Nginx
#  Container นี้ทำหน้าที่สองอย่าง
#    1) Web Server ของไฟล์สแตติก
#    2) Reverse Proxy ส่งต่อ /api/* ไปยัง service `backend` ภายในเครือข่ายของ Docker
#  จึงไม่ต้องแก้ window.API_BASE_URL ในซอร์สโค้ด (ค่าเริ่มต้น /api ใช้ได้ทันที)
# ============================================================================
FROM nginx:1.27-alpine

# ตั้งค่า Nginx (ทับ default site)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# ไฟล์เว็บ
COPY index.html styles.css app.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
