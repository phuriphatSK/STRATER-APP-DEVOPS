# ============================================================================
#  Back-end (Node.js 20 + Express) — Multi-stage build
#  - stage deps  : ติดตั้งเฉพาะ dependency ที่ใช้ตอนรันจริง
#  - stage test  : รัน lint + unit test (ไม่ต้องใช้ฐานข้อมูล) ให้ build ล้มถ้าโค้ดไม่ผ่าน
#  - stage runtime: image สุดท้าย ขนาดเล็ก รันด้วยผู้ใช้ที่ไม่ใช่ root
# ============================================================================

# ---- ติดตั้ง dependency สำหรับ production ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- ตรวจคุณภาพโค้ดและรันชุดทดสอบ ----
FROM node:20-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY eslint.config.js ./
COPY src ./src
COPY tests ./tests
RUN npm run lint && npm test

# ---- image ที่ใช้งานจริง ----
FROM node:20-alpine AS runtime

# บังคับให้ stage test ถูก build เสมอ (BuildKit ตัด stage ที่ไม่มีใครอ้างถึงทิ้ง)
COPY --from=test /app/package.json /tmp/verified-package.json

ARG APP_VERSION=1.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3001

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# ผู้ใช้ node (uid 1000) มีมากับ base image อยู่แล้ว — ไม่รันด้วย root
RUN chown -R node:node /app
USER node

EXPOSE 3001

# ใช้ /api/health ตามที่ README กำหนด (fetch มีให้ใช้ใน Node 20 โดยไม่ต้องลง curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
