import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegistration,
  parsePagination,
  parseSort,
  maskEmail,
  maskPhone,
} from '../src/validation.js';

const validPayload = {
  fullName: 'สมชาย ใจดี',
  studentId: '6510110001',
  faculty: 'คณะวิศวกรรมศาสตร์',
  email: 'student@example.com',
  phone: '0812345678',
  activityId: 1,
  consent: true,
};

test('ข้อมูลลงทะเบียนที่ถูกต้องต้องผ่านการตรวจสอบ', () => {
  const { valid, errors } = validateRegistration(validPayload);
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
});

test('ต้องแจ้งข้อผิดพลาดเมื่อไม่กรอกข้อมูลที่จำเป็น', () => {
  const { valid, errors } = validateRegistration({});
  assert.equal(valid, false);
  assert.ok(errors.fullName);
  assert.ok(errors.studentId);
  assert.ok(errors.faculty);
  assert.ok(errors.email);
  assert.ok(errors.phone);
});

test('ต้องปฏิเสธรูปแบบอีเมลที่ไม่ถูกต้อง', () => {
  const { valid, errors } = validateRegistration({ ...validPayload, email: 'not-an-email' });
  assert.equal(valid, false);
  assert.ok(errors.email);
});

test('ต้องปฏิเสธรหัสนักศึกษาที่ไม่ใช่ตัวเลข 10 หลัก', () => {
  const { errors } = validateRegistration({ ...validPayload, studentId: '12345' });
  assert.ok(errors.studentId);
});

test('ต้องปฏิเสธเบอร์โทรศัพท์ที่ไม่ถูกต้อง', () => {
  const { errors } = validateRegistration({ ...validPayload, phone: '12345' });
  assert.ok(errors.phone);
});

test('ต้องปฏิเสธเมื่อไม่ให้ความยินยอม PDPA', () => {
  const { valid, errors } = validateRegistration({ ...validPayload, consent: false });
  assert.equal(valid, false);
  assert.ok(errors.consent);
});

test('parsePagination ใช้ค่าเริ่มต้นเมื่อไม่ส่งพารามิเตอร์', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 9, offset: 0 });
});

test('parsePagination คำนวณ offset ถูกต้องและจำกัด limit สูงสุด', () => {
  assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
  assert.equal(parsePagination({ limit: '9999' }).limit, 100);
  assert.equal(parsePagination({ page: '-5' }).page, 1);
});

test('parseSort อนุญาตเฉพาะคอลัมน์ที่กำหนดไว้', () => {
  assert.deepEqual(parseSort({ sort: 'title', order: 'desc' }), {
    column: 'title',
    direction: 'DESC',
  });
  // คอลัมน์ที่ไม่อยู่ในรายการต้องถูกแทนที่ด้วยค่าเริ่มต้น
  assert.equal(parseSort({ sort: 'id; DROP TABLE activities' }).column, 'date');
});

test('maskEmail ปิดบังชื่อผู้ใช้บางส่วนแต่คงโดเมนไว้', () => {
  assert.equal(maskEmail('student@example.com'), 'st*****@example.com');
  assert.equal(maskEmail(''), '');
});

test('maskPhone ปิดบังเลขกลางของเบอร์โทรศัพท์', () => {
  assert.equal(maskPhone('0812345678'), '081****678');
});
