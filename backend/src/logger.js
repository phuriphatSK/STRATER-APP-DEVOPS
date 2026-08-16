// Log แบบ JSON บรรทัดละรายการ ออกทาง stdout/stderr
// เพื่อให้รวบรวมเข้าสู่ระบบจัดการ Log ส่วนกลางได้สะดวก
import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, error: 30 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

const write = (level, message, fields = {}) => {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  error: (message, fields) => write('error', message, fields),
};
