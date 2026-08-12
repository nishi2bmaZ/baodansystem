const BASE = 'https://bd.weilaiyilai.cn';
const ADMIN = 'admin123';
const uniq = Date.now();
const email = `test${uniq}@star.com`;
const phone = '13' + String(uniq).slice(-9);

async function j(method, path, body, token, adminKey) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (adminKey) headers['x-admin-key'] = adminKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let d = null; try { d = await res.json(); } catch (e) {}
  return { status: res.status, d };
}

(async () => {
  // 1. register
  let r = await j('POST', '/auth/register', { email, phone, password: 'abc12345' });
  console.log('register', r.status, JSON.stringify(r.d).slice(0, 200));
  // 2. login
  r = await j('POST', '/auth/login', { identifier: email, password: 'abc12345' });
  console.log('login', r.status, JSON.stringify(r.d).slice(0, 200));
  const token = r.d && r.d.token;
  // 3. admin activate user -> need user id. list users.
  r = await j('GET', '/admin/users?status=PENDING', undefined, null, ADMIN);
  const users = (r.d && r.d.users) || r.d || [];
  const me = (Array.isArray(users) ? users : []).find(u => u.email === email) || (Array.isArray(users) ? users[0] : null);
  console.log('listUsers count', Array.isArray(users) ? users.length : 'n/a', 'me', me && me.id);
  if (me) {
    const rev = await j('POST', `/admin/users/${me.id}/review`, { action: 'approve' }, null, ADMIN);
    console.log('activate', rev.status, JSON.stringify(rev.d).slice(0, 120));
  }
  // re-login to get ACTIVE token
  r = await j('POST', '/auth/login', { identifier: email, password: 'abc12345' });
  const tk = r.d && r.d.token;
  console.log('login2', r.status, r.d && r.d.status, 'token?', !!tk);

  // 4. create template with text + number + dropdown + image fields
  const tpl = {
    name: ' repro tpl ' + uniq,
    description: 'desc',
    stages: [{
      title: '阶段1',
      fields: [
        { key: 'f_text', label: '昵称', type: 'text', required: true },
        { key: 'f_num', label: '数量', type: 'number', required: false },
        { key: 'f_img', label: '截图', type: 'image', required: true },
      ],
      steps: [{ label: '步骤1', content: '打开APP\n点击充值\n复制地址', copyable: true }],
    }],
  };
  r = await j('POST', '/admin/task-template', tpl, null, ADMIN);
  console.log('createTpl', r.status, JSON.stringify(r.d).slice(0, 200));
  const tplId = r.d && r.d.id;

  // 5. create instance
  r = await j('POST', '/admin/task-instance', {
    templateId: tplId, title: 'repro inst ' + uniq, date: '2026-08-12',
    quota: 5, startTime: '2026-08-12T00:00', endTime: '2026-08-20T00:00',
  }, null, ADMIN);
  console.log('createInst', r.status, JSON.stringify(r.d).slice(0, 200));
  const instId = r.d && r.d.id;

  // 6/7 member grab + submit
  r = await j('POST', `/task/instance/${instId}/grab`, {}, tk);
  console.log('grab', r.status, JSON.stringify(r.d).slice(0, 200));
  const subId = r.d && r.d.submissionId;
  r = await j('POST', `/task/submission/${subId}/submit`, {
    data: { f_text: '我的昵称', f_num: 3, f_img: 'https://bd.weilaiyilai.cn/uploads/fake.png' },
    images: [],
  }, tk);
  console.log('submit', r.status, JSON.stringify(r.d).slice(0, 200));

  // 8. admin fetch submissions, inspect
  r = await j('GET', '/admin/submissions?status=SUBMITTED', undefined, null, ADMIN);
  const subs = (r.d && r.d.submissions) || r.d || [];
  const sub = (Array.isArray(subs) ? subs : []).find(s => s.id === subId) || (Array.isArray(subs) ? subs[0] : null);
  console.log('=== SUBMISSION KEYS ===', sub ? Object.keys(sub).join(',') : 'none');
  if (sub) {
    console.log('top data =', JSON.stringify(sub.data));
    console.log('stagesData =', JSON.stringify(sub.stagesData));
    console.log('images =', JSON.stringify(sub.images));
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
