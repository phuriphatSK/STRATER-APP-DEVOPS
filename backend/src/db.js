import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString, max: config.db.maxPoolSize }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        max: config.db.maxPoolSize,
      },
);

pool.on('error', (err) => {
  logger.error('เกิดข้อผิดพลาดที่ connection pool ของฐานข้อมูล', { error: err.message });
});

export const query = (text, params) => pool.query(text, params);

/** ใช้โดย /api/health เพื่อตรวจว่าเชื่อมต่อฐานข้อมูลได้จริง */
export const checkDatabase = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error('ตรวจสอบการเชื่อมต่อฐานข้อมูลไม่ผ่าน', { error: err.message });
    return false;
  }
};

export const closePool = () => pool.end();
