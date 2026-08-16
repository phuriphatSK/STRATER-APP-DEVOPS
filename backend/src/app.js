import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { query, checkDatabase } from './db.js';
import {
  validateRegistration,
  parsePagination,
  parseSort,
  maskEmail,
  maskPhone,
} from './validation.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', config.corsOrigin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Expose-Headers', 'X-Total-Count');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  // บันทึก Log ของทุก request โดยไม่บันทึกเนื้อหา body ซึ่งอาจมีข้อมูลส่วนบุคคล
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info('http_request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    });
    next();
  });

  const router = express.Router();

  // ---- ตรวจสอบสถานะระบบ (ใช้กับ HEALTHCHECK และระบบเฝ้าระวัง) ----
  router.get('/health', async (_req, res) => {
    const databaseUp = await checkDatabase();
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Math.floor(process.uptime()),
      version: config.version,
    });
  });

  // ---- รายการกิจกรรม ----
  router.get('/activities', async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const { column, direction } = parseSort(req.query);

      const conditions = [];
      const params = [];

      if (req.query.q) {
        params.push(`%${req.query.q}%`);
        conditions.push(
          `(title ILIKE $${params.length} OR description ILIKE $${params.length} OR location ILIKE $${params.length})`,
        );
      }
      if (req.query.category) {
        params.push(req.query.category);
        conditions.push(`category = $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const totalResult = await query(
        `SELECT COUNT(*)::int AS total FROM activities ${where}`,
        params,
      );
      const total = totalResult.rows[0].total;

      const rowsResult = await query(
        `SELECT id, title, category, description, date, location, capacity, image_url AS "imageUrl"
         FROM activities ${where}
         ORDER BY ${column} ${direction}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      res.set('X-Total-Count', String(total));
      res.json({ data: rowsResult.rows, page, limit, total });
    } catch (err) {
      next(err);
    }
  });

  // ---- ประเภทกิจกรรมทั้งหมด ----
  router.get('/categories', async (_req, res, next) => {
    try {
      const result = await query('SELECT DISTINCT category FROM activities ORDER BY category');
      res.json({ data: result.rows.map((row) => row.category) });
    } catch (err) {
      next(err);
    }
  });

  // ---- รายละเอียดกิจกรรม ----
  router.get('/activities/:id', async (req, res, next) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'รหัสกิจกรรมไม่ถูกต้อง' });
      }

      const result = await query(
        `SELECT a.id, a.title, a.category, a.description, a.date, a.location, a.capacity,
                a.image_url AS "imageUrl",
                (SELECT COUNT(*)::int FROM registrations r WHERE r.activity_id = a.id) AS "registeredCount"
         FROM activities a WHERE a.id = $1`,
        [id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'ไม่พบกิจกรรมที่ต้องการ' });
      }
      return res.json({ data: result.rows[0] });
    } catch (err) {
      return next(err);
    }
  });

  // ---- รายชื่อผู้ลงทะเบียน (ปิดบังข้อมูลส่วนบุคคลบางส่วน) ----
  router.get('/registrations', async (req, res, next) => {
    try {
      const activityId = Number.parseInt(req.query.activityId ?? '', 10);
      if (!Number.isInteger(activityId) || activityId <= 0) {
        return res.status(400).json({ message: 'กรุณาระบุ activityId ที่ถูกต้อง' });
      }

      const result = await query(
        `SELECT id, full_name AS "fullName", student_id AS "studentId", faculty,
                email, phone, activity_id AS "activityId", created_at AS "createdAt"
         FROM registrations WHERE activity_id = $1 ORDER BY created_at`,
        [activityId],
      );

      const data = result.rows.map((row) => ({
        ...row,
        email: maskEmail(row.email),
        phone: maskPhone(row.phone),
      }));

      res.set('X-Total-Count', String(data.length));
      return res.json({ data, total: data.length });
    } catch (err) {
      return next(err);
    }
  });

  // ---- บันทึกการลงทะเบียน ----
  router.post('/registrations', async (req, res, next) => {
    try {
      const { valid, errors } = validateRegistration(req.body);
      if (!valid) {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง', errors });
      }

      const activity = await query('SELECT capacity FROM activities WHERE id = $1', [
        req.body.activityId,
      ]);
      if (activity.rowCount === 0) {
        return res.status(404).json({ message: 'ไม่พบกิจกรรมที่ต้องการลงทะเบียน' });
      }

      const result = await query(
        `INSERT INTO registrations (full_name, student_id, faculty, email, phone, activity_id, consent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, full_name AS "fullName", student_id AS "studentId", faculty,
                   activity_id AS "activityId", created_at AS "createdAt"`,
        [
          req.body.fullName.trim(),
          req.body.studentId.trim(),
          req.body.faculty.trim(),
          req.body.email.trim(),
          req.body.phone.trim(),
          req.body.activityId,
          true,
        ],
      );

      return res.status(201).json({ data: result.rows[0] });
    } catch (err) {
      // ลงทะเบียนซ้ำในกิจกรรมเดียวกัน
      if (err.code === '23505') {
        return res.status(409).json({ message: 'รหัสนักศึกษานี้ลงทะเบียนกิจกรรมนี้ไว้แล้ว' });
      }
      return next(err);
    }
  });

  app.use('/api', router);

  app.use((_req, res) => {
    res.status(404).json({ message: 'ไม่พบเส้นทางที่เรียก' });
  });

  app.use((err, _req, res, _next) => {
    logger.error('unhandled_error', { error: err.message });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  });

  return app;
};
