/* หน้าเว็บกิจกรรมพัฒนานักศึกษา — เรียกข้อมูลผ่าน RESTful API */
(() => {
  'use strict';

  const API = window.API_BASE_URL || '/api';
  const PAGE_SIZE = 9;

  const el = {
    list: document.getElementById('list'),
    status: document.getElementById('status'),
    search: document.getElementById('search'),
    category: document.getElementById('category'),
    prev: document.getElementById('prev'),
    next: document.getElementById('next'),
    pageInfo: document.getElementById('page-info'),
    dialog: document.getElementById('dialog'),
    dialogBody: document.getElementById('dialog-body'),
    dialogClose: document.getElementById('dialog-close'),
    health: document.getElementById('health'),
  };

  const state = { page: 1, total: 0, q: '', category: '' };

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const formatDate = (value) =>
    new Date(value).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const request = async (path, options) => {
    const response = await fetch(`${API}${path}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || 'เรียกข้อมูลไม่สำเร็จ');
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const setStatus = (message, isError = false) => {
    el.status.textContent = message;
    el.status.classList.toggle('error', isError);
  };

  // ---------- รายการกิจกรรม ----------
  const renderActivities = (items) => {
    if (items.length === 0) {
      el.list.innerHTML = '';
      setStatus('ไม่พบกิจกรรมที่ตรงกับเงื่อนไข');
      return;
    }
    setStatus('');
    el.list.innerHTML = items
      .map(
        (item) => `
        <article class="card" data-id="${item.id}" tabindex="0" role="button">
          <img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy">
          <div class="card-body">
            <span class="badge">${escapeHtml(item.category)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <dl>
              <div><dt>วันที่</dt><dd>${escapeHtml(formatDate(item.date))}</dd></div>
              <div><dt>สถานที่</dt><dd>${escapeHtml(item.location)}</dd></div>
              <div><dt>รับ</dt><dd>${item.capacity} คน</dd></div>
            </dl>
          </div>
        </article>`,
      )
      .join('');
  };

  const loadActivities = async () => {
    setStatus('กำลังโหลดข้อมูล...');
    el.list.innerHTML = '';
    const params = new URLSearchParams({ page: state.page, limit: PAGE_SIZE });
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);

    try {
      const result = await request(`/activities?${params}`);
      state.total = result.total;
      renderActivities(result.data);
    } catch (err) {
      setStatus(`เกิดข้อผิดพลาด: ${err.message}`, true);
    }
    updatePagination();
  };

  const updatePagination = () => {
    const pages = Math.max(Math.ceil(state.total / PAGE_SIZE), 1);
    el.pageInfo.textContent = `หน้า ${state.page} จาก ${pages} (ทั้งหมด ${state.total} กิจกรรม)`;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= pages;
  };

  const loadCategories = async () => {
    try {
      const result = await request('/categories');
      for (const name of result.data) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        el.category.append(option);
      }
    } catch {
      // ถ้าโหลดประเภทไม่ได้ ยังใช้งานรายการกิจกรรมได้ตามปกติ
    }
  };

  // ---------- รายละเอียดกิจกรรม + ลงทะเบียน ----------
  const openDialog = (html) => {
    el.dialogBody.innerHTML = html;
    el.dialog.hidden = false;
    el.dialogClose.focus();
  };

  const closeDialog = () => {
    el.dialog.hidden = true;
    el.dialogBody.innerHTML = '';
  };

  const showActivity = async (id) => {
    openDialog('<p>กำลังโหลดรายละเอียด...</p>');
    try {
      const [detail, registrations] = await Promise.all([
        request(`/activities/${id}`),
        request(`/registrations?activityId=${id}`),
      ]);
      const item = detail.data;

      openDialog(`
        <h2 id="dialog-title">${escapeHtml(item.title)}</h2>
        <span class="badge">${escapeHtml(item.category)}</span>
        <p>${escapeHtml(item.description)}</p>
        <dl>
          <div><dt>วันเวลา:</dt> <dd>${escapeHtml(formatDate(item.date))}</dd></div>
          <div><dt>สถานที่:</dt> <dd>${escapeHtml(item.location)}</dd></div>
          <div><dt>จำนวนที่รับ:</dt> <dd>${item.capacity} คน (ลงทะเบียนแล้ว ${item.registeredCount} คน)</dd></div>
        </dl>

        <h3>ผู้ลงทะเบียน (${registrations.total} คน)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ชื่อ-นามสกุล</th><th>รหัสนักศึกษา</th><th>คณะ</th><th>อีเมล</th></tr></thead>
            <tbody>
              ${
                registrations.data.length === 0
                  ? '<tr><td colspan="4">ยังไม่มีผู้ลงทะเบียน</td></tr>'
                  : registrations.data
                      .map(
                        (row) => `<tr>
                          <td>${escapeHtml(row.fullName)}</td>
                          <td>${escapeHtml(row.studentId)}</td>
                          <td>${escapeHtml(row.faculty)}</td>
                          <td>${escapeHtml(row.email)}</td>
                        </tr>`,
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>

        <h3>ลงทะเบียนเข้าร่วมกิจกรรม</h3>
        <form class="form-grid" id="register-form" novalidate>
          <div><label>ชื่อ-นามสกุล <input type="text" name="fullName" required></label></div>
          <div><label>รหัสนักศึกษา <input type="text" name="studentId" inputmode="numeric" required></label></div>
          <div><label>คณะ <input type="text" name="faculty" required></label></div>
          <div><label>อีเมล <input type="email" name="email" required></label></div>
          <div><label>เบอร์โทรศัพท์ <input type="tel" name="phone" inputmode="tel" required></label></div>
          <label class="consent">
            <input type="checkbox" name="consent">
            <span>ข้าพเจ้ายินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลเพื่อการจัดกิจกรรมนี้ (PDPA)</span>
          </label>
          <button class="submit" type="submit">ส่งการลงทะเบียน</button>
          <div id="form-notice"></div>
        </form>
      `);

      document.getElementById('register-form').addEventListener('submit', (event) => {
        event.preventDefault();
        submitRegistration(event.target, id);
      });
    } catch (err) {
      openDialog(`<p class="notice error">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</p>`);
    }
  };

  const submitRegistration = async (form, activityId) => {
    const notice = document.getElementById('form-notice');
    const button = form.querySelector('button[type="submit"]');
    form.querySelectorAll('.field-error').forEach((node) => node.remove());
    notice.innerHTML = '';
    button.disabled = true;

    const data = Object.fromEntries(new FormData(form));
    const body = {
      fullName: data.fullName ?? '',
      studentId: data.studentId ?? '',
      faculty: data.faculty ?? '',
      email: data.email ?? '',
      phone: data.phone ?? '',
      activityId,
      consent: form.elements.consent.checked,
    };

    try {
      await request('/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      notice.innerHTML = '<p class="notice ok">ลงทะเบียนสำเร็จ ขอบคุณที่เข้าร่วมกิจกรรม</p>';
      form.reset();
    } catch (err) {
      const errors = err.payload?.errors;
      if (errors) {
        for (const [field, message] of Object.entries(errors)) {
          const input = form.elements[field];
          if (!input) continue;
          const hint = document.createElement('div');
          hint.className = 'field-error';
          hint.textContent = message;
          input.closest('label')?.append(hint);
        }
      }
      notice.innerHTML = `<p class="notice error">${escapeHtml(err.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  };

  // ---------- สถานะระบบ ----------
  const checkHealth = async () => {
    try {
      const health = await request('/health');
      el.health.textContent = `สถานะระบบ: ${health.status} · ฐานข้อมูล: ${health.database} · เวอร์ชัน ${health.version}`;
      el.health.className = 'health up';
    } catch {
      el.health.textContent = 'สถานะระบบ: ไม่สามารถเชื่อมต่อ API ได้';
      el.health.className = 'health down';
    }
  };

  // ---------- เหตุการณ์ ----------
  let searchTimer;
  el.search.addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = event.target.value.trim();
      state.page = 1;
      loadActivities();
    }, 300);
  });

  el.category.addEventListener('change', (event) => {
    state.category = event.target.value;
    state.page = 1;
    loadActivities();
  });

  el.prev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadActivities();
    }
  });

  el.next.addEventListener('click', () => {
    state.page += 1;
    loadActivities();
  });

  el.list.addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (card) showActivity(Number(card.dataset.id));
  });

  el.list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.card');
    if (card) {
      event.preventDefault();
      showActivity(Number(card.dataset.id));
    }
  });

  el.dialogClose.addEventListener('click', closeDialog);
  el.dialog.addEventListener('click', (event) => {
    if (event.target === el.dialog) closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.dialog.hidden) closeDialog();
  });

  loadCategories();
  loadActivities();
  checkHealth();
  setInterval(checkHealth, 30_000);
})();
