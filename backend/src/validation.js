// ฟังก์ชันตรวจสอบข้อมูลล้วน ๆ ไม่พึ่งพาฐานข้อมูลหรือเครือข่าย
// จึงใช้เป็นเป้าหมายของชุดทดสอบอัตโนมัติในขั้นตอน Test ของ CI ได้

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^0\d{8,9}$/;
const STUDENT_ID_PATTERN = /^\d{10}$/;

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

/**
 * ตรวจสอบข้อมูลการลงทะเบียนเข้าร่วมกิจกรรม
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export const validateRegistration = (payload) => {
  const errors = {};
  const body = payload ?? {};

  if (isBlank(body.fullName)) {
    errors.fullName = 'กรุณากรอกชื่อ-นามสกุล';
  }

  if (isBlank(body.studentId)) {
    errors.studentId = 'กรุณากรอกรหัสนักศึกษา';
  } else if (!STUDENT_ID_PATTERN.test(body.studentId.trim())) {
    errors.studentId = 'รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก';
  }

  if (isBlank(body.faculty)) {
    errors.faculty = 'กรุณากรอกคณะ';
  }

  if (isBlank(body.email)) {
    errors.email = 'กรุณากรอกอีเมล';
  } else if (!EMAIL_PATTERN.test(body.email.trim())) {
    errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  }

  if (isBlank(body.phone)) {
    errors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
  } else if (!PHONE_PATTERN.test(body.phone.trim())) {
    errors.phone = 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก';
  }

  const activityId = Number(body.activityId);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    errors.activityId = 'ไม่พบรหัสกิจกรรมที่ถูกต้อง';
  }

  if (body.consent !== true) {
    errors.consent = 'กรุณาให้ความยินยอมการเก็บและใช้ข้อมูลส่วนบุคคล';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/** อ่านและจำกัดค่าพารามิเตอร์การแบ่งหน้าให้อยู่ในช่วงที่ปลอดภัย */
export const parsePagination = (queryParams = {}) => {
  const rawPage = Number.parseInt(queryParams.page ?? '1', 10);
  const rawLimit = Number.parseInt(queryParams.limit ?? '9', 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 9;

  return { page, limit, offset: (page - 1) * limit };
};

/** อนุญาตให้เรียงตามคอลัมน์ที่กำหนดไว้เท่านั้น เพื่อป้องกัน SQL Injection */
const SORTABLE_COLUMNS = new Set(['id', 'title', 'category', 'date', 'capacity']);

export const parseSort = (queryParams = {}) => {
  const column = SORTABLE_COLUMNS.has(queryParams.sort) ? queryParams.sort : 'date';
  const direction = String(queryParams.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return { column, direction };
};

/** ปิดบังข้อมูลส่วนบุคคลบางส่วนก่อนส่งออกทาง API */
export const maskEmail = (email) => {
  if (isBlank(email) || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(name.length - 2, 1))}@${domain}`;
};

export const maskPhone = (phone) => {
  if (isBlank(phone)) return '';
  const digits = phone.trim();
  return `${digits.slice(0, 3)}${'*'.repeat(Math.max(digits.length - 6, 0))}${digits.slice(-3)}`;
};
