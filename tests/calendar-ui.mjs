import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const python = process.env.LOTUS_PYTHON;
if (!python) throw Error('Set LOTUS_PYTHON.');
const root = await fs.mkdtemp(path.resolve('artifacts/calendar-ui-'));
const output = path.resolve('artifacts/calendar-validation');
await fs.mkdir(output, { recursive: true });
const port = 17875, base = `http://127.0.0.1:${port}`;
function launch(command, initial = false) {
  const exe = process.env.LOTUS_EXE;
  const run = spawnSync(exe || python, [...(exe ? [] : ['launcher.py']), command, '--data-root', root, ...(initial ? ['--port', String(port), '--no-shortcut'] : []), '--no-browser', '--no-tray'], { cwd: path.resolve('.'), windowsHide: true, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(run.status, 0);
}
function query(sql) { return JSON.parse(execFileSync(python, ['tests/sqlite_read.py', root, sql, '[]'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } })); }
async function request(endpoint, body) {
  const headers = { 'X-Lotus-Local': '1' };
  const { token } = await (await fetch(base + '/local-api/session', { headers })).json();
  const response = await fetch(base + '/local-api/' + endpoint, { method: body ? 'POST' : 'GET', headers: { ...headers, 'X-Lotus-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.ok, true);
  return response.json();
}
launch('install', true);
const { data, revision } = await request('desktop-workspace');
data.platforms = [{ id: 'p1', name: '平台一', color: '#343434', fee: 0 }, { id: 'p2', name: '平台二', color: '#919191', fee: 0 }, { id: 'p3', name: '平台三', color: '#d4d4d4', fee: 0 }];
data.clients = [{ id: 'client1', name: '测试单主', platforms: ['p1', 'p2', 'p3'], preferences: '', dislikes: '', requirements: '', notes: '' }];
const order = (id, title, start, due, platform, status = '未开始') => ({ id, title, start, due, platform, status, client: 'client1', category: '测试稿件', deposit: 100, balance: 200, fee: 0, requirements: '', notes: '', extras: [], stages: ['未开始', '成图', '完成'], images: [], paid: status === '完成' });
data.orders = [order('main', '头像稿件', '2026-10-19', '2026-10-23', 'p1'), order('overlap', '半身稿件', '2026-10-21', '2026-10-26', 'p2'), order('long', '跨月稿件', '2026-09-29', '2026-11-03', 'p3'), order('single', '当日稿件', '2026-10-22', '2026-10-22', 'p1'), order('closed', '已完成稿件', '2026-10-12', '2026-10-18', 'p1', '完成')];
data.current = 'main';
await request('desktop-workspace', { data, baseRevision: revision });
const committedOrders = query("SELECT payload FROM desktop_records WHERE collection='orders' ORDER BY id");
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
let context, page;
const errors = [], external = [];
async function open() {
  context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, timezoneId: 'Asia/Shanghai' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(base + '/')) { external.push(url); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-20T04:00:00Z') });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/#home');
  await page.locator('.sidebar').waitFor();
}
const nav = (value) => page.locator(`.nav [data-page=${value}]`).click();
const setView = async (view) => { await page.locator(`[data-action=schedule-view][data-view=${view}]`).click(); await page.waitForFunction(() => document.querySelector('#save-status').textContent === '已保存到电脑'); };
try {
  await open();
  assert.equal(await page.locator('.week-panel .event').count(), 2, 'deadline-only home must exclude start markers and duplicate same-day orders');
  await nav('calendar');
  assert.equal(await page.locator('.month-grid .event').count(), 4);
  const income = await page.locator('.income-summary').innerText();
  await setView('range');
  assert.equal((await request('desktop-workspace')).data.scheduleView, 'range');
  assert.equal(query("SELECT json_extract(metadata,'$.scheduleView') AS view FROM desktop_workspace WHERE id=1")[0].view, 'range');
  assert.equal(await page.locator('.schedule-range-month .schedule-range-event[data-id=long]').count(), 5);
  assert.equal(await page.locator('.income-summary').innerText(), income, 'display style must not change income calculations');
  assert.equal(await page.locator('.schedule-range-event[data-id=single]').count(), 1);
  await page.screenshot({ path: path.join(output, 'calendar-range.png') });
  await page.locator('.schedule-range-day[data-date="2026-10-22"] .range-date').click();
  assert.equal(await page.locator('[role=dialog] .detail-link').count(), 4, 'day details must include all active intervals on that date');
  await page.locator('[data-action=close-modal]').click();
  await page.locator('.schedule-range-event[data-id=main]').first().click();
  assert.match(await page.locator('.linked-detail').innerText(), /头像稿件/);
  await nav('calendar');
  await page.locator('[data-action=month-next]').click();
  const last = page.locator('.schedule-range-event[data-id=long]').last();
  assert.equal(await last.getAttribute('data-range-span'), '2');
  assert.equal(await last.evaluate((el) => el.classList.contains('continues-after')), false);
  await page.locator('[data-action=month-prev]').click();
  await page.locator('#platform-filter').selectOption('p2');
  assert.deepEqual(await page.locator('.schedule-range-event').evaluateAll((nodes) => nodes.map((n) => n.dataset.id)), ['overlap', 'overlap']);
  await nav('home');
  assert.equal(await page.locator('[data-view=range]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.week-panel .schedule-range-event[data-id=closed]').count(), 0);
  assert.equal(await page.locator('.week-panel .schedule-range-event').count(), 4);
  const main = page.locator('.week-panel .schedule-range-event[data-id=main]');
  assert.equal(await main.getAttribute('data-range-column'), '1');
  assert.equal(await main.getAttribute('data-range-span'), '5');
  const geometry = await main.evaluate((el) => {
    const bar = el.getBoundingClientRect(), row = el.closest('.schedule-range-week'), days = row.querySelectorAll('.schedule-range-day'), first = days[0].getBoundingClientRect(), fifth = days[4].getBoundingClientRect();
    return { left: bar.left - first.left, right: fifth.right - bar.right, width: bar.width, expected: fifth.right - first.left - 6 };
  });
  assert.ok(Math.abs(geometry.left - 3) < 2 && Math.abs(geometry.right - 3) < 2 && Math.abs(geometry.width - geometry.expected) < 2, 'one continuous filled bar must span all five day columns');
  const rectangles = await page.locator('.week-panel .schedule-range-event').evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  for (let a = 0; a < rectangles.length; a++) for (let b = a + 1; b < rectangles.length; b++) {
    const x = rectangles[a], y = rectangles[b];
    assert.ok(!(x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top), 'overlapping commissions must occupy separate tracks');
  }
  await page.screenshot({ path: path.join(output, 'home-range.png') });
  await setView('deadline');
  assert.equal(await page.locator('.week-panel .event').count(), 2);
  await nav('calendar');
  assert.equal(await page.locator('[data-view=deadline]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.month-grid .event').count(), 4);
  await setView('range');
  await context.close(); launch('stop'); launch('start'); await open();
  assert.equal(await page.locator('[data-view=range]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.week-panel .schedule-range-event').count(), 4);
  assert.deepEqual(query("SELECT payload FROM desktop_records WHERE collection='orders' ORDER BY id"), committedOrders);
  await page.route('**/local-api/desktop-workspace', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '模拟保存失败' }) }) : route.continue());
  await page.locator('[data-view=deadline]').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('保存失败'));
  assert.equal(await page.locator('[data-view=range]').getAttribute('aria-pressed'), 'true');
  assert.equal((await request('desktop-workspace')).data.scheduleView, 'range');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, root, errors, external, checked: ['deadline-only excludes starts and same-day duplication', 'continuous bar spans day columns', 'overlaps have distinct rows', 'cross-week and month continuation', 'day details and order click', 'platform filter', 'shared saved choice in week and month', 'income unchanged', 'browser and service restart persistence', 'SQLite order payloads unchanged', 'failed save restores previous display and reports error'] }, null, 2));
  console.log('PASS: week/month style switches, contiguous bars, overlap lanes, cross-month ranges, click/filter links, SQLite persistence and save error handling.');
} finally { await browser.close(); launch('stop'); }
