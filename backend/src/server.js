import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closePool } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.nodeEnv });
});

// ปิดระบบอย่างเรียบร้อยเมื่อ Container สั่งหยุดการทำงาน
const shutdown = (signal) => {
  logger.info('server_shutting_down', { signal });
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // กันกรณีปิดไม่ลงภายในเวลาที่กำหนด
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
