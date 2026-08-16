# คู่มือการนำระบบขึ้นใช้งาน (Deployment Guide)

เอกสารประกอบผลงานข้อสอบภาคปฏิบัติ (POC) — การนำ **Starter Application เว็บกิจกรรมพัฒนานักศึกษา** ขึ้นระบบ
ครอบคลุมงานตามข้อ 3.2 ของเอกสารข้อสอบ ได้แก่ Containerization, Reverse Proxy, CI/CD Pipeline,
ระบบเฝ้าระวัง (Monitoring) และระบบสำรองข้อมูล (Backup)

---

## 🔎 สำหรับผู้ตรวจ — ทดสอบทั้งระบบด้วย 4 คำสั่ง

ต้องมีเพียง Docker Engine + Docker Compose v2 เท่านั้น ไม่ต้องติดตั้ง Node.js หรือ PostgreSQL บนเครื่อง

```bash
git clone <URL ของ Repository> && cd starter-app-devops

./ops/scripts/init-env.sh                        # สร้าง .env พร้อมสุ่มรหัสผ่านให้อัตโนมัติ
docker compose up -d --build                     # ยกทั้งระบบขึ้น (ใช้เวลาประมาณ 2-3 นาทีครั้งแรก)
./ops/scripts/wait-for-healthy.sh                # รอจนทุกบริการพร้อม
./ops/scripts/smoke-test.sh http://localhost:8080 # ทดสอบอัตโนมัติ 18 รายการ
```

จากนั้นเปิดเว็บที่ <http://localhost:8080>

| ต้องการตรวจเรื่อง | คำสั่ง / ที่อยู่ | ดูรายละเอียดที่ |
|--------------------|------------------|------------------|
| การสำรองและกู้คืนข้อมูล | `./ops/scripts/backup-drill.sh` | หัวข้อ 5 |
| ระบบเฝ้าระวังและการแจ้งเตือน | `docker compose --profile monitoring up -d` แล้วเปิด <http://localhost:3000> | หัวข้อ 6 |
| CI/CD Pipeline | แท็บ **Actions** บน GitHub Repository | หัวข้อ 7 |
| รายการที่แก้ไขจากชุดตั้งต้น | — | หัวข้อ 8 |
| ผลทดสอบที่ผู้เข้าสอบรันไว้ | — | หัวข้อ 9 |

> รหัสผ่านที่ `init-env.sh` สุ่มให้จะแสดงบนหน้าจอ (ใช้ล็อกอิน Grafana) และถูกเก็บไว้ในไฟล์ `.env`
> ซึ่ง `.gitignore` กันไม่ให้ขึ้น Repository ตามหลักการไม่เก็บค่าลับไว้ในซอร์สโค้ด

---

## 1. ภาพรวมสถาปัตยกรรม

```
                    ┌──────────────────────────────────────────────┐
   ผู้ใช้ ──────────►│  web (Nginx)          พอร์ต 8080 → 80        │
   :8080            │  • Web Server ของ Front-end (HTML/CSS/JS)    │
                    │  • Reverse Proxy: /api/* → backend:3001      │
                    │  • gzip, cache, rate limit, security header  │
                    └───────────────┬──────────────────────────────┘
                                    │ เครือข่าย edge
                    ┌───────────────▼──────────────────────────────┐
                    │  backend (Node.js 20 + Express)              │
                    │  • ไม่เปิดพอร์ตออกสู่ host                    │
                    │  • รันด้วยผู้ใช้ node (ไม่ใช่ root)            │
                    │  • read-only filesystem + healthcheck        │
                    └───────────────┬──────────────────────────────┘
                                    │ เครือข่าย data
        ┌───────────────────────────▼───────────┐   ┌──────────────────────┐
        │  db (PostgreSQL 16)                   │◄──┤  backup              │
        │  • init.sql ทำงานอัตโนมัติครั้งแรก      │   │  • pg_dump ตามรอบเวลา │
        │  • ข้อมูลเก็บใน volume `pgdata`         │   │  • ลบไฟล์เก่าอัตโนมัติ  │
        └───────────────────────────────────────┘   └──────────────────────┘

   ระบบเฝ้าระวัง (profile: monitoring)
   prometheus ◄── node-exporter / cadvisor / postgres-exporter / blackbox-exporter
        │
        ├── alertmanager (แจ้งเตือน)
        └── grafana (แดชบอร์ด)
```

**หลักการที่ใช้ออกแบบ**

| ประเด็น | การตัดสินใจ |
|---------|-------------|
| การเข้าถึงจากภายนอก | เปิดพอร์ตเดียวคือ `web` เท่านั้น `backend` และ `db` ไม่ผูกพอร์ตกับ host |
| การแยกเครือข่าย | `edge` (web ↔ backend) และ `data` (backend/backup ↔ db) แยกกัน — Web Server ติดต่อฐานข้อมูลโดยตรงไม่ได้ |
| ค่าลับ | อยู่ในไฟล์ `.env` ซึ่งถูก `.gitignore` ไว้ ไม่มีค่าลับฝังในซอร์สโค้ดหรือ image |
| CORS | เรียก API ผ่านโดเมนเดียวกัน (`/api`) จึงไม่ต้องเปิด CORS ข้ามโดเมน |
| การอัปเดต | `docker compose up -d --build` แล้วตรวจสุขภาพ ถ้าไม่ผ่านให้ย้อนกลับด้วยเวอร์ชันเดิม |

---

## 2. ความต้องการของระบบ

- Docker Engine 24 ขึ้นไป และ Docker Compose v2
- พื้นที่ว่างประมาณ 2 GB สำหรับ image และข้อมูล
- พอร์ตที่ต้องว่าง: `8080` (เว็บ) และเพิ่มเติมเมื่อเปิดระบบเฝ้าระวัง `9090`, `9093`, `3000`

---

## 3. เริ่มใช้งาน (Quick Start)

```bash
# 1) สร้างไฟล์ตั้งค่า พร้อมสุ่มรหัสผ่านอัตโนมัติ
./ops/scripts/init-env.sh
#    หรือทำเองด้วย: cp .env.example .env แล้วแก้ POSTGRES_PASSWORD และ GRAFANA_ADMIN_PASSWORD

# 2) ยกระบบขึ้น
docker compose up -d --build

# 3) รอให้ทุกบริการพร้อม แล้วทดสอบการทำงาน
./ops/scripts/wait-for-healthy.sh
./ops/scripts/smoke-test.sh http://localhost:8080
```

เปิดใช้งานที่ <http://localhost:8080>

> ถ้าเครื่องมีคำสั่ง `make` ใช้ `make init && make up && make smoke` แทนได้ (ดูคำสั่งทั้งหมดด้วย `make help`)

### คำสั่งที่ใช้บ่อย

| งาน | คำสั่ง |
|-----|--------|
| ดูสถานะบริการ | `docker compose ps` |
| ดู log | `docker compose logs -f backend` |
| หยุดระบบ (ข้อมูลยังอยู่) | `docker compose down` |
| ลบระบบพร้อมข้อมูล | `docker compose down -v` |
| เข้าฐานข้อมูล | `docker compose exec db psql -U app_user -d psu_activities` |
| เปิดระบบเฝ้าระวัง | `docker compose --profile monitoring up -d` |

---

## 4. Containerization

### 4.1 Back-end (`backend/Dockerfile`)

Multi-stage build 3 ขั้น

1. `deps` — `npm ci --omit=dev` ติดตั้งเฉพาะ dependency ที่ใช้ตอนรัน
2. `test` — `npm run lint && npm test` **ถ้าโค้ดไม่ผ่าน image จะ build ไม่สำเร็จ** (คุณภาพถูกบังคับตั้งแต่ขั้น build)
3. `runtime` — คัดลอกเฉพาะ `node_modules` และ `src` ลง `node:20-alpine`

มาตรการความปลอดภัยและความทนทานที่ใส่ไว้

- รันด้วยผู้ใช้ `node` (uid 1000) ไม่ใช่ root
- `read_only: true` + `tmpfs:/tmp` — เขียนไฟล์ลง container ไม่ได้
- `no-new-privileges` และจำกัด CPU/RAM (1 core / 512 MB)
- `HEALTHCHECK` เรียก `/api/health` ทุก 30 วินาที
- `init: true` เพื่อให้ SIGTERM ส่งถึงโปรเซสจริง และแอปปิดตัวอย่างเรียบร้อยตามที่ `server.js` เตรียมไว้

### 4.2 Front-end + Reverse Proxy (`frontend/Dockerfile`, `frontend/nginx/default.conf`)

Container เดียวทำหน้าที่ทั้ง Web Server ของไฟล์สแตติกและ Reverse Proxy

- `/api/*` → `http://backend:3001` (ส่งต่อ path เดิม จึงไม่ต้องแก้ `window.API_BASE_URL`)
- ใช้ `resolver 127.0.0.11` กับตัวแปร upstream — Nginx สตาร์ตได้แม้ `backend` ยังไม่พร้อม แล้วค่อยเชื่อมเมื่อพร้อม
- ส่งต่อ `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto`
- `limit_req` 20 req/s (burst 40) ป้องกันการยิงถล่มจุดลงทะเบียน
- gzip, cache ไฟล์สแตติก 7 วัน, `index.html` ไม่ cache เพื่อให้ผู้ใช้ได้เวอร์ชันใหม่ทันทีหลัง deploy
- security header: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, ปิด `server_tokens`

### 4.3 ฐานข้อมูล

- `postgres:16-alpine` เก็บข้อมูลใน named volume `pgdata`
- `db/init.sql` ถูก mount เข้า `/docker-entrypoint-initdb.d/` แบบอ่านอย่างเดียว — ทำงานอัตโนมัติเฉพาะการสร้างฐานข้อมูลครั้งแรก
- `healthcheck` ด้วย `pg_isready` และ `backend` รอจนฐานข้อมูล healthy ก่อนจึงเริ่มทำงาน (`depends_on: condition: service_healthy`)

### 4.4 การเปิดใช้ HTTPS (เมื่อขึ้นเซิร์ฟเวอร์จริง)

ระบบเปิดพอร์ต HTTP ไว้สำหรับ POC หากนำขึ้นใช้งานจริงให้เพิ่ม certificate แล้วเปลี่ยน `frontend/nginx/default.conf` เป็น

```nginx
server { listen 80; server_name activities.psu.ac.th; return 301 https://$host$request_uri; }
server {
    listen 443 ssl http2;
    server_name activities.psu.ac.th;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    # ... location เดิมทั้งหมด ...
}
```

แล้ว mount ไดเรกทอรี certificate เข้า service `web` พร้อมเปิดพอร์ต 443

---

## 5. ระบบสำรองข้อมูลและการกู้คืน

### 5.1 การสำรองข้อมูลอัตโนมัติ

Service `backup` รัน `crond` ตามตาราง `BACKUP_CRON` (ค่าเริ่มต้น 02:00 ของทุกวัน)

- ใช้ `pg_dump --format=custom` ซึ่งบีบอัดในตัวและกู้คืนแบบเลือกตารางได้
- **ตรวจสอบไฟล์ทุกครั้งด้วย `pg_restore --list`** ก่อนถือว่าสำเร็จ — ไฟล์เสียจะไม่ถูกนับเป็น backup
- สร้าง `.sha256` กำกับทุกไฟล์เพื่อตรวจความสมบูรณ์ตอนกู้คืน
- ลบไฟล์ที่เก่ากว่า `BACKUP_RETENTION_DAYS` (ค่าเริ่มต้น 7 วัน) อัตโนมัติ
- เขียน log เป็น JSON ออก stdout รวมเข้ากับ log ของระบบได้ทันที
- ไฟล์เก็บที่ `./backups` บนเครื่อง host (ถูก `.gitignore` ไว้ เพราะมีข้อมูลส่วนบุคคล)

```bash
# สำรองข้อมูลทันทีโดยไม่รอรอบเวลา
docker compose exec backup backup.sh

# ดูรายการไฟล์สำรองข้อมูล
ls -lh backups/
```

### 5.2 การกู้คืน

```bash
# กู้คืนจากไฟล์ล่าสุด (ต้องยืนยันด้วย CONFIRM=yes เพราะข้อมูลเดิมจะถูกเขียนทับ)
docker compose exec -e CONFIRM=yes backup restore.sh latest

# หรือระบุไฟล์เอง
docker compose exec -e CONFIRM=yes backup \
  restore.sh /backups/psu_activities-20260813-020000.dump
```

### 5.3 การซ้อมกู้คืน (Restore Drill)

แผนสำรองข้อมูลที่ไม่เคยทดสอบกู้คืน เท่ากับยังไม่มีแผนสำรองข้อมูล จึงมีสคริปต์ซ้อมแบบครบวงจร
ซึ่งจะสำรองข้อมูล → ลบข้อมูลบางส่วนโดยเจตนา → กู้คืน → ตรวจว่าจำนวนแถวกลับมาเท่าเดิม

```bash
./ops/scripts/backup-drill.sh
```

สคริปต์นี้ถูกเรียกใน CI ทุกครั้งที่มีการเปลี่ยนแปลงโค้ด

---

## 6. ระบบเฝ้าระวัง (Monitoring)

```bash
docker compose --profile monitoring up -d
```

| บริการ | ที่อยู่ | หน้าที่ |
|--------|--------|---------|
| Grafana | <http://localhost:3000> | แดชบอร์ด (ผู้ใช้/รหัสผ่านจาก `.env`) |
| Prometheus | <http://localhost:9090> | เก็บ metric และประเมินกฎแจ้งเตือน |
| Alertmanager | <http://localhost:9093> | รวมและส่งต่อการแจ้งเตือน |

**สิ่งที่เฝ้าระวัง**

| แหล่งข้อมูล | เก็บอะไร |
|-------------|----------|
| blackbox-exporter | ตรวจ `/`, `/healthz`, `/api/health`, `/api/activities` จากภายนอกเหมือนผู้ใช้จริง |
| postgres-exporter | สถานะฐานข้อมูล จำนวน connection ขนาดฐานข้อมูล |
| cadvisor | CPU/RAM/IO ของแต่ละ container |
| node-exporter | CPU/RAM/ดิสก์ของเครื่องแม่ข่าย |

แดชบอร์ด **PSU Activities — ภาพรวมระบบ** ถูก provision ไว้อัตโนมัติ ไม่ต้องสร้างเอง

**กฎแจ้งเตือนที่ตั้งไว้** (`ops/monitoring/prometheus/alerts.yml`)

| ระดับ | เงื่อนไข |
|-------|----------|
| critical | บริการไม่ตอบสนองเกิน 2 นาที (`ServiceDown`) |
| critical | `/api/health` ตอบ 503 = เชื่อมต่อฐานข้อมูลไม่ได้ (`ApiHealthDegraded`) |
| critical | เชื่อมต่อ PostgreSQL ไม่ได้ (`PostgresDown`) |
| warning | API ตอบช้ากว่า 1.5 วินาที ต่อเนื่อง 5 นาที |
| warning | CPU > 85%, RAM > 90%, ดิสก์เหลือ < 15% |
| warning | container รีสตาร์ตซ้ำเกิน 2 ครั้งใน 15 นาที |

ค่าเริ่มต้นเก็บการแจ้งเตือนไว้ในหน้าเว็บ Alertmanager เท่านั้น (ไม่มีค่าลับใน Repository)
หากต้องการส่งอีเมลหรือแชท ให้เปิดใช้ตัวอย่างที่คอมเมนต์ไว้ใน `ops/monitoring/alertmanager/alertmanager.yml`

### การรวบรวม Log

Back-end พิมพ์ log เป็น JSON บรรทัดละรายการอยู่แล้ว ทุกบริการตั้ง `json-file` driver แบบหมุนไฟล์
(สูงสุด 10 MB × 5 ไฟล์ต่อ container) จึงต่อเข้าระบบรวม log เช่น Loki หรือ ELK ได้ทันทีโดยไม่ต้องแก้แอป

---

## 7. CI/CD Pipeline

### `.github/workflows/ci.yml` — ทำงานทุก push / pull request

| ขั้น | รายละเอียด |
|------|-----------|
| `quality` | `npm ci` → `npm run lint` → `npm test` → `npm audit` |
| `validate-compose` | ตรวจไวยากรณ์ `docker-compose.yml` ทั้งแบบปกติและ profile monitoring |
| `build` | build image ของ backend และ web แบบขนาน, ติด tag ตาม branch/tag/sha, push ขึ้น GHCR, สแกนช่องโหว่ด้วย Trivy แล้วส่งผลเข้าหน้า Security |
| `integration` | **ยกทั้ง stack ขึ้นจริงใน CI** แล้วรัน smoke test 18 ข้อ + ซ้อมสำรอง/กู้คืนข้อมูล |

### `.github/workflows/cd.yml` — ทำงานเมื่อ push tag `v*` หรือสั่งเอง

1. ส่งไฟล์ขึ้นเซิร์ฟเวอร์ด้วย `rsync` over SSH
2. สร้าง `.env` บนเซิร์ฟเวอร์จาก GitHub Secrets
3. **สำรองฐานข้อมูลก่อน deploy เสมอ**
4. `docker compose up -d --build`
5. ตรวจสุขภาพ + smoke test หลัง deploy
6. ถ้าขั้นใดล้มเหลว → ย้อนกลับเป็นเวอร์ชันก่อนหน้าอัตโนมัติ (`.env.previous`)

**ค่าลับที่ต้องตั้งใน Repository Settings → Secrets**
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`, `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`

### ขอบเขตที่ได้ทดสอบจริง และข้อจำกัด

| ส่วน | สถานะ |
|------|--------|
| `ci.yml` ทั้ง 4 job | ✅ รันจริงบน GitHub Actions ผ่านครบ รวมถึง job `integration` ที่ยกทั้ง stack ขึ้นบน Ubuntu แล้วรัน smoke test 18 ข้อ + ซ้อมกู้คืนข้อมูล |
| `cd.yml` | ⚠️ **ยังไม่ได้รันจริง** เนื่องจาก POC นี้ไม่มีเซิร์ฟเวอร์ปลายทางให้ deploy — ไฟล์นี้จึงเป็นการออกแบบกระบวนการนำขึ้นระบบ (สำรองข้อมูลก่อน → deploy → ตรวจสุขภาพ → ย้อนกลับเมื่อล้มเหลว) ที่พร้อมใช้เมื่อมีเซิร์ฟเวอร์และตั้งค่า Secrets ครบ |

### การเข้าถึง Container Image ที่ CI สร้างไว้

CI จะ push image ขึ้น GitHub Container Registry (GHCR) ทุกครั้งที่ push ขึ้น branch

```bash
docker pull ghcr.io/phuriphatsk/strater-app-devops-backend:main
docker pull ghcr.io/phuriphatsk/strater-app-devops-web:main
```

> GHCR ตั้ง package เป็น **private** ให้โดยอัตโนมัติ หากต้องการให้ผู้อื่นดึง image ไปใช้ได้
> ต้องเข้าไปตั้งเป็น Public ที่หน้า Packages ของ Repository ก่อน
> ทั้งนี้ไม่จำเป็นต่อการตรวจผลงาน เพราะ `docker compose up -d --build` จะ build จากซอร์สโค้ดให้อยู่แล้ว

---

## 8. รายการที่แก้ไขจากชุดตั้งต้น

ตามข้อ 7 ของ README ต้นฉบับ ที่กำหนดให้ระบุรายการที่แก้ไข

### ไม่มีการแก้ไขตรรกะการทำงานของแอปพลิเคชัน

**ไฟล์ในโฟลเดอร์ `backend/src`, `backend/tests`, `frontend/*.html|css|js` และ `db/init.sql`
ไม่ถูกแก้ไขแม้แต่บรรทัดเดียว** — แอปอ่านค่าตั้งค่าจาก Environment Variable และมี `/api/health` มาแล้ว
จึงนำขึ้น Container ได้โดยไม่ต้องแตะซอร์สโค้ด (รวมถึงไม่ต้องแก้ `window.API_BASE_URL`
เพราะ Reverse Proxy ให้บริการที่ `/api` บนโดเมนเดียวกันตามค่าเริ่มต้นอยู่แล้ว)

### ไฟล์เดิมที่แก้ไข (3 ไฟล์ ไม่เกี่ยวกับตรรกะการทำงาน)

| ไฟล์ | การแก้ไข | เหตุผล |
|------|----------|--------|
| `.env.example` | เพิ่ม "ส่วนที่ 2" สำหรับ docker compose (ค่าฐานข้อมูล, พอร์ต, การสำรองข้อมูล, ระบบเฝ้าระวัง) โดยคงส่วนเดิมไว้ครบ | ให้ไฟล์เดียวใช้เป็นแม่แบบได้ทั้งการรันแบบปกติและแบบ Container |
| `.gitignore` | เพิ่ม `backups/`, `*.dump`, `.env.previous` | กันไฟล์สำรองข้อมูลซึ่งมีข้อมูลส่วนบุคคลหลุดเข้า Repository |
| `README.md` | เพิ่มกล่องชี้ทางมายังเอกสารฉบับนี้ 4 บรรทัดใต้หัวเรื่อง (เนื้อหาเดิมคงไว้ครบทุกบรรทัด) | ให้ผู้ตรวจที่เปิด README เป็นไฟล์แรกพบส่วนของผลงานได้ทันที |

### ไฟล์ที่เพิ่มขึ้นใหม่

```
docker-compose.yml                      ประกอบทุกบริการเข้าด้วยกัน (+ profile monitoring)
Makefile                                คำสั่งลัดสำหรับดูแลระบบ
DEPLOYMENT.md                           เอกสารฉบับนี้

backend/Dockerfile                      multi-stage build + lint/test + non-root
backend/.dockerignore
frontend/Dockerfile                     Nginx serve static
frontend/.dockerignore
frontend/nginx/default.conf             Web Server + Reverse Proxy

ops/backup/Dockerfile                   container สำรองข้อมูล
ops/backup/entrypoint.sh                ตั้งตาราง cron
ops/backup/backup.sh                    pg_dump + ตรวจไฟล์ + ลบไฟล์เก่า
ops/backup/restore.sh                   กู้คืน + ตรวจ checksum

ops/monitoring/prometheus/prometheus.yml
ops/monitoring/prometheus/alerts.yml
ops/monitoring/alertmanager/alertmanager.yml
ops/monitoring/blackbox/blackbox.yml
ops/monitoring/grafana/provisioning/datasources/prometheus.yml
ops/monitoring/grafana/provisioning/dashboards/dashboards.yml
ops/monitoring/grafana/dashboards/app-overview.json

ops/scripts/wait-for-healthy.sh         รอให้ทุกบริการ healthy
ops/scripts/smoke-test.sh               ทดสอบระบบผ่าน Reverse Proxy
ops/scripts/backup-drill.sh             ซ้อมสำรอง/กู้คืนข้อมูล

.github/workflows/ci.yml                lint / test / build / scan / integration test
.github/workflows/cd.yml                deploy + ตรวจสุขภาพ + ย้อนกลับอัตโนมัติ
```

---

## 9. ผลการทดสอบระบบจริง

ทดสอบบน Docker Engine 29.3.1 / Docker Compose v5.1.1 ด้วยชุดคำสั่งที่ให้มาในโปรเจกต์นี้

| รายการทดสอบ | คำสั่ง | ผล |
|--------------|--------|-----|
| ยกระบบขึ้นจากศูนย์ (build + start) | `docker compose up -d --build` | สำเร็จ ทุก container ขึ้นครบ |
| ทุกบริการมีสถานะ healthy | `./ops/scripts/wait-for-healthy.sh` | ผ่านภายใน 27 วินาที |
| ทดสอบการทำงานผ่าน Reverse Proxy | `./ops/scripts/smoke-test.sh` | **ผ่าน 18 / 18 รายการ** |
| สำรอง → ลบข้อมูล → กู้คืน | `./ops/scripts/backup-drill.sh` | ผ่าน (16 → 8 → 16 กิจกรรม) พร้อมตรวจ checksum |
| ระบบเฝ้าระวัง | `docker compose --profile monitoring up -d` | Prometheus เก็บข้อมูลได้ทุก target (`probe_success = 1` ทั้ง 5 จุด, `pg_up = 1`), โหลดกฎแจ้งเตือน 11 ข้อ, Grafana provision แดชบอร์ดสำเร็จ |

**ทดสอบพฤติกรรมเมื่อเกิดเหตุขัดข้อง**

| สถานการณ์จำลอง | ผลที่ได้ | สรุป |
|-----------------|----------|------|
| หยุด `backend` | หน้าเว็บยังเปิดได้ (200), `/api/health` ตอบ 502 | Front-end ไม่ล่มตาม Back-end |
| เปิด `backend` กลับ | `/api/health` กลับมา 200 เองภายในไม่กี่วินาที | Nginx เชื่อมต่อ upstream ใหม่ได้เองโดยไม่ต้องรีสตาร์ต |
| หยุด `db` | `/api/health` ตอบ **503** `{"status":"degraded","database":"down"}` | Health check สะท้อนสถานะจริง ใช้กับระบบเฝ้าระวังได้ |
| เปิด `db` กลับ | `/api/health` กลับเป็น `{"status":"ok","database":"up"}` | ระบบฟื้นตัวเองได้ |

---

## 10. การแก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|-------|------------------|
| `docker compose up` แจ้งว่าต้องกำหนด `POSTGRES_PASSWORD` | ยังไม่ได้สร้างไฟล์ `.env` — ใช้ `cp .env.example .env` แล้วแก้รหัสผ่าน |
| หน้าเว็บขึ้นแต่ไม่มีข้อมูลกิจกรรม | ดู `docker compose logs backend` — มักเกิดจากรหัสผ่านฐานข้อมูลใน `.env` ไม่ตรงกับที่ volume เดิมสร้างไว้ ถ้าเป็นระบบทดสอบให้ `docker compose down -v` แล้วยกใหม่ |
| แก้ `db/init.sql` แล้วข้อมูลไม่เปลี่ยน | สคริปต์ทำงานเฉพาะตอนสร้างฐานข้อมูลครั้งแรก ต้อง `docker compose down -v` (ข้อมูลเดิมหาย) หรือรัน `psql` ด้วยตนเอง |
| พอร์ต 8080 ถูกใช้อยู่ | แก้ `APP_PORT` ในไฟล์ `.env` |
| Grafana ไม่มีข้อมูล | ตรวจว่าเปิดด้วย `--profile monitoring` และดู target ที่ <http://localhost:9090/targets> |
| `node-exporter`/`cadvisor` ขึ้นค่าแปลกบน Windows | ทั้งสองอ่านค่าจาก Linux VM ของ Docker Desktop ไม่ใช่ Windows โดยตรง — บนเซิร์ฟเวอร์ Linux จริงจะได้ค่าของเครื่องแม่ข่ายถูกต้อง |
