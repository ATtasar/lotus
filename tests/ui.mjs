import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import { chromium } from '@playwright/test';


await fs.mkdir('artifacts', { recursive: true });
const root = await fs.mkdtemp(path.resolve('artifacts/desktop-ui-'));
const output = path.resolve('artifacts/desktop-validation');
await fs.mkdir(output, { recursive: true });
const port = 17865,
  base = `http://127.0.0.1:${port}`;
const python = process.env.LOTUS_PYTHON;
const frozenExe = process.env.LOTUS_EXE;
if (!python) throw Error('Set LOTUS_PYTHON to the Python executable used for source tests.');
function launch(command, initialize = false) {
 const result=spawnSync(frozenExe || python,[...(frozenExe ? [] : [path.resolve('launcher.py')]),command,'--data-root',root,...(initialize?['--port',String(port),'--no-shortcut']:[]),'--no-browser','--no-tray'],{cwd:path.resolve('.'),stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
 assert.equal(result.status,0);
}
function query(sql, params=[]) {
 return JSON.parse(execFileSync(python,[path.resolve('tests/sqlite_read.py'),root,sql,JSON.stringify(params)],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}}));
}
launch('install',true);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const errors = [],
  external = [];
let context;
async function newPage() {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    timezoneId: 'Asia/Shanghai',
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(base + '/')) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator('.sidebar').waitFor();
  return page;
}
async function state() {
  const { token } = await (
    await fetch(base + '/local-api/session', { headers: { 'X-Lotus-Local': '1' } })
  ).json();
  return (
    await (
      await fetch(base + '/local-api/desktop-workspace', {
        headers: { 'X-Lotus-Local': '1', 'X-Lotus-Token': token },
      })
    ).json()
  ).data;
}
async function stop() {launch('stop');}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
try {
  let page = await newPage();
  const action = async (name) => {
    const selector = `[data-action="${name}"]`;
    const dialog = page.getByRole('dialog');
    const target =
      (await dialog.isVisible()) && (await dialog.locator(selector).count())
        ? dialog.locator(selector)
        : page.locator(selector);
    await target.first().click();
  };
  const nav = (name) => page.locator(`.nav [data-page="${name}"]`).click();
  const saved = () =>
    page.waitForFunction(
      () => document.querySelector('#save-status')?.textContent === '已保存到电脑',
    );
  const upload = async (name) => {
    const chooser = page.waitForEvent('filechooser');
    await action(name);
    await (await chooser).setFiles({ name: '参考图.png', mimeType: 'image/png', buffer: png });
  };
  const initial = await state();
  for (const key of ['platforms', 'clients', 'orders', 'templates', 'assets', 'toolTemplates'])
    assert.equal(initial[key].length, 0);
  const bounds = await page.evaluate(() => ({
    sidebar: document.querySelector('.sidebar').getBoundingClientRect().width,
    content: document.querySelector('.shell').getBoundingClientRect().width,
    phoneShell: !!document.querySelector('.app-shell'),
  }));
  assert.equal(bounds.sidebar, 224);
  assert.ok(bounds.content > 1000);
  assert.equal(bounds.phoneShell, false);
  await page.screenshot({ path: path.join(output, 'desktop-blank.png'), fullPage: true });
  await nav('clients');
  await action('new-client');
  await page.locator('[name=name]').fill('电脑端测试单主');
  await page.locator('[name=preferences]').fill('保留留白');
  await page.locator('[name=cn]').fill('测试作者名');
  await page.locator('[name=salutation]').fill('测试称呼');
  await page.locator('[name=platformLink]').fill('https://example.com/client');
  assert.equal(await page.locator('[name=name]').inputValue(), '电脑端测试单主');
  assert.equal(await page.locator('[name=preferences]').inputValue(), '保留留白');
  await action('inline-platform');
  await page.locator('#new-platform-name').fill('测试平台');
  await action('save-inline-platform');
  await page.locator('button[form=client-form]').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await action('platform-manager');
  await page.locator('.platform-manager-row [name=color]').fill('#ff3366');
  await page.locator('button[form=platform-form]').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.equal((await state()).platforms[0].color, '#ff3366');

  await nav('templates');
  await action('new-template');
  assert.equal(await page.locator('[name=duration]').count(), 0);
  assert.equal(await page.locator('[name=category]').inputValue(), '');
  assert.equal(await page.locator('#category-choice option:not([value=""])').count(), 0);
  await page.locator('[name=title]').fill('电脑端头像模板');
  await page.locator('[name=category]').fill('头像');
  await page.locator('[name=deposit]').fill('100');
  await page.locator('[name=balance]').fill('200');
  await page.locator('[name=optional-stage][value="草稿"]').check();
  await page.locator('#custom-stage-name').fill('配色确认');
  await action('add-custom-stage');
  assert.equal(await page.locator('[name=optional-stage][value="配色确认"]').isChecked(), true);
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await action('new-template');
  assert.equal(await page.locator('[name=category]').inputValue(), '');
  assert.deepEqual(
    await page
      .locator('#category-choice option:not([value=""])')
      .evaluateAll((nodes) => nodes.map((n) => n.value)),
    ['头像'],
  );
  await page.locator('#category-choice').selectOption('头像');
  assert.equal(await page.locator('[name=category]').inputValue(), '头像');
  await page.locator('[name=category]').fill('尚未保存的类别');
  await action('close-modal');
  await nav('orders');
  await action('new-order');
  assert.equal(await page.locator('#category-choice option[value="尚未保存的类别"]').count(), 0);
  await page.locator('#order-template').selectOption({ label: '电脑端头像模板' });
  assert.equal(await page.locator('[name=due]').inputValue(), '');
  assert.equal(await page.locator('[name=optional-stage][value="配色确认"]').isChecked(), true);
  await page.locator('[name=title]').fill('本地电脑端稿件');
  await page.locator('[name=client]').selectOption({ label: '电脑端测试单主' });
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  await page.locator('[name=due]').fill(date);
  await page.locator('[name=requirements]').fill('电脑端稿件要求');
  await upload('upload-draft');
  await page.locator('.upload-preview img').waitFor();
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await page.locator('tbody [data-action=client-detail]').first().click();
  assert.match(await page.locator('.breadcrumb').innerText(), /稿件管理.*电脑端测试单主/s);
  assert.match(await page.locator('.linked-detail').innerText(), /历史稿件/);
  await page.locator('[data-action=breadcrumb-nav][data-index="0"]').click();
  await page.locator('tbody [data-action=order-detail]').first().click();
  assert.match(await page.locator('.breadcrumb').innerText(), /稿件管理.*本地电脑端稿件/s);
  await action('edit-order');
  await page.locator('[name=notes]').fill('编辑后保存');
  await page.locator('[name=status]').selectOption('草稿');
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await page.reload();
  await page.locator('.sidebar').waitFor();
  assert.equal((await state()).orders[0].status, '草稿');
  assert.equal((await state()).orders[0].notes, '编辑后保存');
  assert.match(
    JSON.parse(
      query("SELECT payload FROM desktop_records WHERE collection='orders'")[0].payload,
    ).images[0],
    /^@disk:[a-f0-9]{64}$/,
  );
  await nav('calendar');
  assert.equal(
    await page.locator('.event strong').filter({ hasText: '本地电脑端稿件' }).count(),
    1,
  );
  assert.match(await page.locator('.event').first().getAttribute('style'), /#ff3366/);
  assert.match(await page.locator('.income-total').innerText(), /100/);
  await nav('clients');
  await page.locator('[data-action=client-detail]').first().click();
  assert.match(await page.locator('.linked-detail').innerText(), /本地电脑端稿件/);
  assert.match(await page.locator('.linked-detail').innerText(), /测试作者名/);
  assert.match(await page.locator('.linked-detail').innerText(), /测试称呼/);
  assert.match(await page.locator('.linked-detail').innerText(), /合作次数\s*1 次/);
  await page.locator('#client-history-search').fill('不匹配的关键词');
  assert.equal(await page.locator('#client-history-list .detail-link').count(), 0);
  await page.locator('#client-history-search').fill('本地电脑端');
  assert.equal(await page.locator('#client-history-list .detail-link').count(), 1);
  await page.locator('#client-history-list .detail-link').click();
  assert.match(await page.locator('.breadcrumb').innerText(), /单主管理.*电脑端测试单主.*本地电脑端稿件/s);
  await page.locator('[data-action=breadcrumb-nav][data-index="1"]').click();
  assert.match(await page.locator('.linked-detail').innerText(), /测试作者名/);
  await nav('home');
  assert.match(await page.locator('.current-body').innerText(), /电脑端稿件要求/);
  assert.match(await page.locator('.week-panel').innerText(), /仅显示截稿日期/);
  assert.doesNotMatch(await page.locator('.week-panel').innerText(), /开始 \/ 截稿/);
  assert.equal(await page.locator('.week-panel .event strong').filter({ hasText: '本地电脑端稿件' }).count(), 1);
  await page.screenshot({ path: path.join(output, 'desktop-home.png'), fullPage: true });
  await nav('tools');
  await upload('upload-assets');
  await page.locator('.asset-item img').waitFor();
  await saved();
  const customizeCanvas = async (kind) => {
    assert.equal(await page.locator('.tool-settings [required]').count(), 0);
    await page.locator('[data-design-global=font]').selectOption('song');
    await page.locator('[data-design-global=color]').fill('#123456');
    await page.locator('[data-design-global=bg]').fill('#f6f0e8');
    await page.locator('[data-design-global=style]').selectOption('border');
    if (kind !== 'layout') await page.locator('[data-design-global=preset]').selectOption('left');
    const backgroundChooser = page.waitForEvent('filechooser');
    await page.locator('[data-design-action=background]').click();
    await (
      await backgroundChooser
    ).setFiles({ name: '底图.png', mimeType: 'image/png', buffer: png });
    await page.locator('[data-design-action=clear-background]').waitFor();
    const imageChooser = page.waitForEvent('filechooser');
    await page.locator('[data-design-action=add-image]').click();
    await (await imageChooser).setFiles({ name: '插图.png', mimeType: 'image/png', buffer: png });
    await page.locator('.design-layer-name').filter({ hasText: '插图.png' }).waitFor();
    await page.locator('[data-design-action=add-text]').click();
    await page.locator('[data-design-prop=text]').fill('自定义交付文字');
    await page.locator('[data-design-prop=font]').selectOption('kai');
    await page.locator('[data-design-prop=width]').fill('280');
    const x = Number(await page.locator('[data-design-prop=x]').inputValue());
    const y = Number(await page.locator('[data-design-prop=y]').inputValue());
    const canvas = page.locator('#output-canvas');
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const box = await canvas.boundingBox(),
      size = await canvas.evaluate((c) => ({ width: c.width, height: c.height }));
    await page.mouse.move(
      box.x + (x / size.width) * box.width,
      box.y + (y / size.height) * box.height,
    );
    await page.mouse.down();
    await page.mouse.move(
      box.x + (x / size.width) * box.width + 30,
      box.y + (y / size.height) * box.height + 20,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.ok(
      Number(await page.locator('[data-design-prop=x]').inputValue()) > x + 1,
      'text must move by a real pointer drag',
    );
    assert.ok(Number(await page.locator('[data-design-prop=y]').inputValue()) > y + 1);
  };
  for (const kind of ['receipt', 'card', 'watermark', 'layout']) {
    await page.locator(`[data-action=open-tool][data-tool=${kind}]`).click();
    if (kind === 'receipt' || kind === 'card') {
      assert.equal(await page.locator('[data-tool-field=customer]').inputValue(), '电脑端测试单主');
      if (kind === 'card') {
        await page.locator('[data-tool-field=cardNumber]').fill('测试卡号');
        assert.equal(
          await page.getByRole('checkbox', { name: '显示卡号', exact: true }).isChecked(),
          false,
        );
        await page.getByRole('checkbox', { name: '显示卡号', exact: true }).check();
        await page.getByRole('checkbox', { name: '显示卡号', exact: true }).uncheck();
      }
      await customizeCanvas(kind);
      await page.locator('[data-tool-field=name]').fill(kind + '测试模板');
      await action('save-tool-template');
      await saved();
      const originalTemplate = (await state()).toolTemplates.find((t) => t.kind === kind);
      assert.equal(originalTemplate.design.font, 'song');
      assert.equal(originalTemplate.design.color, '#123456');
      assert.equal(originalTemplate.design.items.at(-1).text, '自定义交付文字');
      assert.ok(originalTemplate.design.backgroundImage.startsWith('data:image/'));
      await page.locator('[data-design-global=font]').selectOption('hei');
      await action('update-tool-template');
      await saved();
      assert.equal((await state()).toolTemplates.filter((t) => t.kind === kind).length, 1);
      await page.locator('[data-tool-field=name]').fill(kind + '副本模板');
      await action('save-tool-template');
      await saved();
      assert.equal((await state()).toolTemplates.filter((t) => t.kind === kind).length, 2);
      await action('new-tool-template');
      await page
        .locator(`[data-action=load-tool-template][data-id="${originalTemplate.id}"]`)
        .click();
      assert.equal(await page.locator('[data-design-global=font]').inputValue(), 'hei');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, kind + '-custom-editor.png') });
      if (kind === 'receipt') {
        await action('new-tool-template');
        await page.locator('[data-tool-field=customer]').fill('手动填写的单主');
        await page.locator('[data-tool-field=name]').fill('手填信息模板');
        await action('save-tool-template');
        await saved();
        const manual = (await state()).toolTemplates.find((t) => t.name === '手填信息模板');
        assert.equal(manual.customer, '手动填写的单主');
        await action('new-tool-template');
        await page.locator(`[data-action=load-tool-template][data-id="${manual.id}"]`).click();
        assert.equal(
          await page.locator('[data-tool-field=customer]').inputValue(),
          '手动填写的单主',
        );
      }
      const download = page.waitForEvent('download');
      await action(kind === 'receipt' ? 'export-pdf' : 'export-png');
      const file = await download;
      await file.saveAs(path.join(output, file.suggestedFilename()));
      assert.ok((await fs.stat(path.join(output, file.suggestedFilename()))).size > 100);
    } else if (kind === 'watermark') {
      await upload('upload-mark');
      await page.locator('[data-drop=watermark-mark] img').waitFor();
      await saved();
      await upload('upload-base');
      await page.locator('[data-drop=watermark-image] img').waitFor();
      const file = page.waitForEvent('download');
      await action('export-png');
      await (await file).saveAs(path.join(output, 'watermark.png'));
      await action('clear-base');
      assert.equal(await page.locator('[data-drop=watermark-mark] img').count(), 1);
    } else {
      await upload('upload-layout');
      await customizeCanvas(kind);
      await page.locator('#layout-template-name').fill('电脑端排版模板');
      await action('save-layout-template');
      await saved();
      const template = (await state()).toolTemplates.find((t) => t.kind === 'layout');
      assert.equal(template.layout.items.at(-1).text, '自定义交付文字');
      await page.locator('[data-design-global=font]').selectOption('mono');
      await action('update-layout-template');
      await saved();
      assert.equal((await state()).toolTemplates.filter((t) => t.kind === 'layout').length, 1);
      await action('new-layout-template');
      await page.locator(`[data-action=load-layout-template][data-id="${template.id}"]`).click();
      assert.equal(await page.locator('[data-design-global=font]').inputValue(), 'mono');
    }
    await action('tools-back');
  }
  await action('settings');
  assert.equal(await page.locator('[data-action=lan-settings]').count(), 0);
  assert.doesNotMatch(await page.locator('.nav').innerText(), /收纳|手机/);
  assert.match(await page.getByRole('dialog').innerText(), /workbench\.sqlite/);
  assert.match(await page.getByRole('dialog').innerText(), /当前安装版本：1\.2\.0/);
  await page.route('**/local-api/update', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: '网络不可用，软件仍可离线使用。' }),
    }),
  );
  await action('check-update');
  await page.waitForFunction(() => document.querySelector('#update-status')?.textContent.includes('离线使用'));
  assert.match(await page.getByRole('dialog').innerText(), /网络不可用.*离线使用/s);
  await page.unroute('**/local-api/update');
  await page.route('**/local-api/update', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentVersion: '1.2.0',
        latestVersion: '1.3.0',
        releaseName: 'Lotus 1.3.0',
        releaseNotes: '测试更新说明',
        releaseUrl: 'https://github.com/ATtasar/lotus/releases/tag/v1.3.0',
        publishedAt: '2026-10-19T00:00:00Z',
        updateAvailable: true,
        isLatest: false,
      }),
    }),
  );
  await action('check-update');
  await page.waitForFunction(() => document.querySelector('#update-status')?.textContent.includes('1.3.0'));
  assert.match(await page.getByRole('dialog').innerText(), /最新版本.*1\.3\.0|发现新版本 1\.3\.0/);
  assert.match(await page.getByRole('dialog').innerText(), /测试更新说明/);
  assert.match(await page.getByRole('dialog').innerText(), /关闭 Lotus/);
  await page.unroute('**/local-api/update');
  await action('backup-local');
  await page.waitForFunction(() =>
    document.querySelector('#toast').textContent.includes('数据库与图片已备份'),
  );
  assert.ok((await fs.readdir(path.join(root, 'backups'))).length > 0);
  const download = page.waitForEvent('download');
  await action('backup-export');
  await (await download).saveAs(path.join(output, 'test-backup.json'));
  const before = await state();
  await action('backup-import');
  await page.locator('#global-file').setInputFiles(path.join(output, 'test-backup.json'));
  await page.getByRole('dialog').filter({ hasText: '导入并替换工作台' }).waitFor();
  assert.deepEqual(await state(), before); // Merely choosing a file must not replace anything.
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.deepEqual(await state(), before);
  await context.close();
  await stop();
  launch('start');
  page = await newPage();
  assert.deepEqual(await state(), before);
  assert.match(await page.locator('.current-body').innerText(), /编辑后保存/);
  await action('settings');
  await action('import-browser');
  await page.waitForFunction(() =>
    document.querySelector('#toast').textContent.includes('未找到旧电脑端记录'),
  );
  assert.deepEqual(await state(), before);
  const legacy = structuredClone(before);
  legacy.orders[0].title = '从原电脑网页导入的稿件';
  await page.evaluate(
    (value) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('still-commission-workbench-blank-v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('state');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('state', 'readwrite');
          tx.objectStore('state').put(value, 'workspace');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    legacy,
  );
  await action('import-browser');
  await page.getByRole('dialog').filter({ hasText: '导入并替换工作台' }).waitFor();
  assert.deepEqual(await state(), before);
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.deepEqual(await state(), legacy);
  const source = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('still-commission-workbench-blank-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            read = db.transaction('state').objectStore('state').get('workspace');
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
  assert.deepEqual(source, legacy);
  // Remember a category independently of the final order/template using it.
  await nav('templates');
  await action('new-template');
  await page.locator('[name=title]').fill('类别记忆测试');
  await page.locator('[name=category]').fill('保留的自定义类别');
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  const categoryTemplate = (await state()).templates.find((t) => t.title === '类别记忆测试');
  await page.locator(`[data-action=edit-template][data-id="${categoryTemplate.id}"]`).click();
  await action('delete-draft');
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  await page.reload();
  await page.locator('.sidebar').waitFor();
  await nav('templates');
  await action('new-template');
  assert.equal(await page.locator('[name=category]').inputValue(), '');
  assert.equal(await page.locator('#category-choice option[value="保留的自定义类别"]').count(), 1);
  const remembered = await state();
  assert.ok(remembered.categories.includes('保留的自定义类别'));
  assert.equal(remembered.templates.filter((t) => t.category === '保留的自定义类别').length, 0);
  await action('close-modal');
  await action('category-manager');
  await page.locator('#new-category-name').fill('可删除类别');
  await action('add-category');
  await saved();
  assert.ok((await state()).categories.includes('可删除类别'));
  await page.locator('[data-action=delete-category][data-name="可删除类别"]').click();
  await saved();
  await page.locator('[data-action=delete-category][data-name="保留的自定义类别"]').click();
  await saved();
  assert.equal((await state()).categories.includes('可删除类别'), false);
  assert.equal((await state()).categories.includes('保留的自定义类别'), false);
  await action('close-category-manager');
  await nav('orders');
  await action('new-order');
  await page.locator('[name=title]').fill('临时删除测试稿件');
  await page.locator('[name=category]').fill('头像');
  await page.locator('[name=client]').selectOption({ label: '电脑端测试单主' });
  await page.locator('[name=due]').fill(date);
  await page.locator('#save-order-btn').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  const disposable = (await state()).orders.find((o) => o.title === '临时删除测试稿件');
  await page.locator(`[data-action=order-detail][data-id="${disposable.id}"]`).first().click();
  await action('edit-order');
  await action('delete-draft');
  await action('confirm-action');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.equal(
    (await state()).orders.some((o) => o.id === disposable.id),
    false,
  );
  assert.equal(
    query("SELECT id FROM desktop_records WHERE collection='orders' AND id=?",[disposable.id])[0],
    undefined,
  );
  assert.equal((await state()).orders.length, remembered.orders.length);
  assert.equal((await state()).orders[0].images[0], remembered.orders[0].images[0]);
  // A successful HTTP response without a commit acknowledgement is not a save.
  // Both cases leave the real database and the editing form intact.
  for (const status of [500, 200]) {
    await nav('orders');
    const committed = await state();
    await page.locator('tbody [data-action=order-detail]').first().click();
    await action('edit-order');
    await page.locator('[name=notes]').fill('未提交的修改-' + status);
    assert.equal(await page.locator('#save-status').innerText(), '表单有未保存修改');
    let warned = false;
    page.once('dialog', async (dialog) => {
      warned = dialog.type() === 'beforeunload';
      await dialog.dismiss();
    });
    await page.reload({ timeout: 3000 }).catch(() => {});
    assert.equal(warned, true, 'unsaved form must warn before leaving');
    assert.equal(await page.locator('[name=notes]').inputValue(), '未提交的修改-' + status);
    const routePattern = '**/local-api/desktop-workspace';
    await page.route(routePattern, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status,
            contentType: 'application/json',
            body: status === 500 ? JSON.stringify({ message: '模拟写盘失败' }) : '{}',
          })
        : route.continue(),
    );
    await page.locator('#save-order-btn').click();
    await page.waitForFunction(() =>
      document.querySelector('#save-status').textContent.includes('保存失败'),
    );
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    assert.deepEqual(await state(), committed);
    assert.equal(JSON.parse(query("SELECT payload FROM desktop_records WHERE collection='orders'")[0].payload).notes, committed.orders[0].notes);
    await page.unroute(routePattern);
    page.once('dialog', (dialog) => dialog.accept());
    await page.reload();
    await page.locator('.sidebar').waitFor();
    await saved();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await fs.writeFile(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        ui: 'lotus-desktop-1.2',
        root,
        bounds,
        external,
        errors,
        checked: [
          'blank initialization',
          'desktop width and left navigation',
          'client/platform/template/order create and edit',
          'optional client CN / salutation / platform URL and searchable history',
          'duration-free templates and persisted custom commission stages',
          'saved category selection, category manager create/delete and linked statistics',
          'platform color persistence across lists, calendar and schedule',
          'deadline-only calendar and weekly schedule',
          'clickable order/client hierarchy with breadcrumb navigation',
          'release check version, notes, download link and data-safety guidance',
          'editable fonts / colors / background / styles in three components',
          'real text dragging, optional card number and manual template text',
          'save as new / update / switch component templates',
          'private image persistence',
          'status edit / refresh checked against SQLite',
          'order deletion confirmed against SQLite while other images remain',
          'unsaved form leave warning',
          'HTTP error and invalid success acknowledgement never claim saved',
          'no storage or phone entry points in desktop UI',
          'calendar and client associations',
          'receipt PDF and card PNG',
          'watermark and layout templates',
          'full physical backup',
          'JSON confirmed restore',
          'browser and service restart persistence',
          'confirmed legacy IndexedDB migration preserves source',
          'all external HTTP blocked',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS Lotus desktop UI, linked workflows, update panel, local files, backups and restart persistence',
  );
} finally {
  await browser.close();
  await stop();
}
