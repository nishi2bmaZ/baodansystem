const fs = require('fs');
const { JSDOM } = require('jsdom');

const ADMIN = 'admin123';
const BASE = 'https://bd.weilaiyilai.cn';

async function main() {
  // 1) fetch real SUB 1 from server
  const res = await fetch(BASE + '/admin/submissions', { headers: { 'x-admin-key': ADMIN } });
  const d = await res.json();
  const subs = d.submissions || d;
  const sub1 = subs.find(s => s.id === 1) || subs[0];
  console.log('Using submission id=', sub1 && sub1.id, 'instanceId=', sub1 && sub1.instanceId);

  // 2) load admin.html in jsdom
  const html = fs.readFileSync('public/admin.html', 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: BASE + '/admin.html',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async () => ({ ok: true, json: async () => ({ users: [] }) });
      window.prompt = () => null;
      if (!window.navigator.clipboard) window.navigator.clipboard = { writeText: async () => {} };
    },
  });
  const { window } = dom;
  // wait a tick for script to run
  await new Promise(r => setTimeout(r, 200));

  // 3) call showDetail(1) in the page context
  const code = `A.subs = ${JSON.stringify([sub1])}; showDetail(${sub1.id});`;
  window.eval(code);
  await new Promise(r => setTimeout(r, 50));

  const out = window.document.querySelector('#pageBody').innerHTML;
  // print text-ish view: strip tags lightly
  const text = out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('=== RENDERED TEXT (tags stripped) ===');
  console.log(text.slice(0, 1500));
  console.log('=== contains 交易哈希 value? ===', out.includes('0x83Cc') || out.includes('6456476') || out.includes('15575549994'));
  console.log('=== contains 挂售价格 value? ===', out.includes('1999'));
  console.log('=== img count ===', (out.match(/<img/g) || []).length);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
