// อ่านค่าตั้งค่าทั้งหมดจาก Environment Variable
// ไม่มีการฝังค่าลับไว้ในซอร์สโค้ด เพื่อให้นำไปใส่ Container ได้ทันที

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: int(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  version: process.env.APP_VERSION ?? '1.0.0',
  db: {
    // ถ้ากำหนด DATABASE_URL มา ให้ใช้ค่านี้เป็นหลัก มิฉะนั้นจึงประกอบจาก PG*
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST ?? 'localhost',
    port: int(process.env.PGPORT, 5432),
    database: process.env.PGDATABASE ?? 'psu_activities',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? '',
    maxPoolSize: int(process.env.PGPOOL_MAX, 10),
  },
};
