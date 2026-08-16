# Starter Application — เว็บกิจกรรมพัฒนานักศึกษา (สำหรับข้อสอบ POC ด้าน DevOps)

ชุดแอปพลิเคชันตั้งต้นสำหรับข้อสอบภาคปฏิบัติ (POC) ตำแหน่ง **นักวิชาการคอมพิวเตอร์ (ปฏิบัติงานด้าน DevOps และโครงสร้างพื้นฐานระบบ)**
สังกัดงานสารสนเทศนักศึกษา กองพัฒนานักศึกษาและศิษย์เก่าสัมพันธ์ สำนักงานอธิการบดี มหาวิทยาลัยสงขลานครินทร์

> 📌 **ส่วนของผลงานผู้เข้าสอบ (การนำระบบขึ้นใช้งาน) อยู่ที่ [DEPLOYMENT.md](DEPLOYMENT.md)**
> ครอบคลุม Containerization, Reverse Proxy, CI/CD, Monitoring, Backup พร้อมรายการที่แก้ไขจากชุดตั้งต้น
> เริ่มใช้งานอย่างเร็ว: `cp .env.example .env` (แก้รหัสผ่าน) แล้ว `docker compose up -d --build` → <http://localhost:8080>
>
> เอกสารด้านล่างนี้คือ README ต้นฉบับของชุดแอปพลิเคชันตั้งต้น (ไม่ได้แก้ไขเนื้อหาเดิม)

> **โจทย์ของผู้เข้าสอบคือการนำแอปพลิเคชันชุดนี้ขึ้นระบบ ไม่ใช่การพัฒนาแอปพลิเคชันขึ้นใหม่**
> ชุดนี้จงใจ **ไม่มี** `Dockerfile`, `docker-compose.yml`, การตั้งค่า Reverse Proxy, CI/CD Pipeline,
> ระบบเฝ้าระวัง (Monitoring) และระบบสำรองข้อมูล (Backup) — ทั้งหมดนี้คือส่วนที่ผู้เข้าสอบต้องจัดทำขึ้นเอง
> ตามข้อ 3.2 ของเอกสารข้อสอบ

---

## 1. โครงสร้างโปรเจกต์

```
starter-app-devops/
├── backend/                 # RESTful API (Node.js + Express + PostgreSQL)
│   ├── src/
│   │   ├── app.js           # ประกอบ Express app และ route ทั้งหมด
│   │   ├── server.js        # จุดเริ่มโปรแกรม + graceful shutdown
│   │   ├── config.js        # อ่านค่าตั้งค่าจาก Environment Variable
│   │   ├── db.js            # Connection pool ของ PostgreSQL
│   │   └── validation.js    # ฟังก์ชันตรวจสอบข้อมูล (ไม่พึ่งฐานข้อมูล)
│   ├── tests/
│   │   └── validation.test.js   # ชุดทดสอบอัตโนมัติ (รันได้โดยไม่ต้องมีฐานข้อมูล)
│   ├── eslint.config.js
│   └── package.json
├── frontend/                # หน้าเว็บ (HTML/CSS/JavaScript ล้วน ไม่ต้อง build)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── db/
│   └── init.sql             # สร้างตาราง + ข้อมูลตัวอย่าง 16 กิจกรรม
├── .env.example
└── README.md
```

---

## 2. ความต้องการของระบบ (สำหรับรันแบบไม่ใช้ Container)

- Node.js 20 ขึ้นไป
- PostgreSQL 14 ขึ้นไป

---

## 3. วิธีรันแบบไม่ใช้ Container (เพื่อทำความเข้าใจระบบก่อนนำขึ้น Container)

### 3.1 เตรียมฐานข้อมูล

```bash
createdb psu_activities
psql -d psu_activities -f db/init.sql
```

### 3.2 ตั้งค่า Environment Variable

```bash
cp .env.example backend/.env
# แก้ไขค่าใน backend/.env ให้ตรงกับฐานข้อมูลของเครื่องตนเอง
```

### 3.3 รัน Back-end

```bash
cd backend
npm install
npm start           # ให้บริการที่ http://localhost:3001
```

### 3.4 รัน Front-end

หน้าเว็บเป็นไฟล์สแตติกล้วน ให้บริการด้วย Web Server ใดก็ได้ เช่น

```bash
cd frontend
npx serve -l 8080   # เปิดที่ http://localhost:8080
```

Front-end อ่านที่อยู่ของ API จาก `window.API_BASE_URL` ซึ่งกำหนดไว้ในไฟล์ `frontend/index.html`
ค่าเริ่มต้นคือ `/api` (เรียกผ่าน Reverse Proxy) หากรันแยกกันโดยไม่มี Reverse Proxy
ให้แก้เป็น `http://localhost:3001/api` ชั่วคราว

### 3.5 คำสั่งอื่น ๆ

```bash
cd backend
npm test            # รันชุดทดสอบอัตโนมัติ (ไม่ต้องมีฐานข้อมูล)
npm run lint        # ตรวจสอบคุณภาพโค้ด
```

---

## 4. ตัวแปรตั้งค่า (Environment Variable)

ดูรายการทั้งหมดในไฟล์ `.env.example` โดยตัวแปรที่จำเป็นคือ

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|--------|------------|----------|
| `PORT` | `3001` | พอร์ตที่ Back-end ให้บริการ |
| `DATABASE_URL` | — | Connection string ของ PostgreSQL (ใช้แทน `PG*` ทั้งชุดได้) |
| `PGHOST` | `localhost` | โฮสต์ของฐานข้อมูล |
| `PGPORT` | `5432` | พอร์ตของฐานข้อมูล |
| `PGDATABASE` | `psu_activities` | ชื่อฐานข้อมูล |
| `PGUSER` | `postgres` | ชื่อผู้ใช้ฐานข้อมูล |
| `PGPASSWORD` | — | รหัสผ่านฐานข้อมูล |
| `CORS_ORIGIN` | `*` | Origin ที่อนุญาตให้เรียก API |
| `LOG_LEVEL` | `info` | ระดับการบันทึก Log (`debug` / `info` / `error`) |

> **ห้าม commit ไฟล์ `.env` ที่มีค่าจริงลงใน Repository** ให้ใช้ `.env.example` เป็นแม่แบบเท่านั้น

---

## 5. รายการ API

Base path ของ API คือ `/api`

| วิธี | Endpoint | คำอธิบาย |
|------|----------|----------|
| GET | `/api/health` | ตรวจสอบสถานะของบริการและการเชื่อมต่อฐานข้อมูล |
| GET | `/api/activities` | รายการกิจกรรม (รองรับ `page`, `limit`, `q`, `category`, `sort`, `order`) |
| GET | `/api/activities/:id` | รายละเอียดกิจกรรมตาม id |
| GET | `/api/categories` | รายชื่อประเภทกิจกรรมทั้งหมด |
| GET | `/api/registrations?activityId=:id` | รายชื่อผู้ลงทะเบียนของกิจกรรมนั้น |
| POST | `/api/registrations` | บันทึกการลงทะเบียนเข้าร่วมกิจกรรม |

### ตัวอย่างการเรียกใช้

```bash
curl http://localhost:3001/api/health
curl "http://localhost:3001/api/activities?page=1&limit=9&category=กีฬา"
curl "http://localhost:3001/api/activities?q=อาสา"
curl http://localhost:3001/api/activities/1
curl "http://localhost:3001/api/registrations?activityId=1"

curl -X POST http://localhost:3001/api/registrations \
  -H "Content-Type: application/json" \
  -d '{"fullName":"สมชาย ใจดี","studentId":"6510110001","faculty":"คณะวิศวกรรมศาสตร์","email":"student@example.com","phone":"0812345678","activityId":1,"consent":true}'
```

### รูปแบบผลลัพธ์

`GET /api/activities` ตอบกลับพร้อมข้อมูลการแบ่งหน้า และส่ง header `X-Total-Count`

```json
{
  "data": [ { "id": 1, "title": "...", "category": "...", "date": "...", "location": "...", "capacity": 80 } ],
  "page": 1,
  "limit": 9,
  "total": 16
}
```

`GET /api/health` ตอบกลับ HTTP 200 เมื่อระบบปกติ และ HTTP 503 เมื่อเชื่อมต่อฐานข้อมูลไม่ได้

```json
{ "status": "ok", "database": "up", "uptimeSeconds": 42, "version": "1.0.0" }
```

---

## 6. ข้อมูลตัวอย่าง

`db/init.sql` สร้างตาราง 2 ตาราง คือ `activities` และ `registrations`
พร้อมข้อมูลกิจกรรมตัวอย่าง **16 รายการ** ครอบคลุม 5 ประเภท
(อบรม/สัมมนา, จิตอาสา, กีฬา, ศิลปวัฒนธรรม, พัฒนาทักษะอาชีพ)
และข้อมูลการลงทะเบียนตัวอย่างจำนวนหนึ่ง เพื่อให้ทดสอบการค้นหา การกรอง การแบ่งหน้า
และการสำรอง/กู้คืนข้อมูลได้

ไฟล์นี้สามารถนำไปใช้เป็น initialization script ของ PostgreSQL container ได้โดยตรง

---

## 7. ข้อควรทราบสำหรับผู้เข้าสอบ

- **ห้ามแก้ไขตรรกะการทำงานหลัก** ของแอปพลิเคชัน แก้ไขได้เท่าที่จำเป็นต่อการนำขึ้นระบบ
  เช่น การอ่านค่าตั้งค่าเพิ่มเติมจาก Environment Variable หรือการเพิ่ม Health Check
  โดยให้ระบุรายการที่แก้ไขไว้ใน README ของผลงานตนเอง
- แอปพลิเคชันนี้อ่านค่าตั้งค่าทั้งหมดจาก Environment Variable อยู่แล้ว
  จึงพร้อมสำหรับการนำไปใส่ Container โดยไม่ต้องแก้ซอร์สโค้ด
- `GET /api/health` มีไว้ให้ใช้กับ `HEALTHCHECK` ของ Container และระบบเฝ้าระวัง
- Back-end พิมพ์ Log ออกทาง stdout/stderr ในรูปแบบ JSON บรรทัดละรายการ
  เพื่อให้รวบรวมเข้าสู่ระบบจัดการ Log ได้สะดวก
