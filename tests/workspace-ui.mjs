// All records below exist only in this newly-created throwaway test database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const python = process.env.LOTUS_PYTHON;
if (!python) throw Error('LOTUS_PYTHON required');
const root = await fs.mkdtemp(path.resolve('artifacts/workspace-ui-'));
const output = path.resolve('artifacts/workspace-validation');
await fs.mkdir(output, { recursive: true });
const port = 17877,
    base = `http://127.0.0.1:${port}`;
function launch(command, initialize = false) {
    const exe = process.env.LOTUS_EXE;
    const result = spawnSync(
        exe || python,
        [
            ...(exe ? [] : ['launcher.py']),
            command,
            '--data-root',
            root,
            ...(initialize ? ['--port', String(port), '--no-shortcut'] : []),
            '--no-browser',
            '--no-tray',
        ],
        {
            cwd: path.resolve('.'),
            windowsHide: true,
            encoding: 'utf8',
            env: { ...process.env, PYTHONUTF8: '1' },
        },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
}
async function api(endpoint, body) {
    const headers = { 'X-Lotus-Local': '1' };
    const { token } = await (await fetch(base + '/local-api/session', { headers })).json();
    const response = await fetch(base + '/local-api/' + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
            ...headers,
            'X-Lotus-Token': token,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(JSON.stringify(result));
    return result;
}
const state = async () => (await api('desktop-workspace')).data;
const query = (sql) =>
    JSON.parse(
        execFileSync(python, ['tests/sqlite_read.py', root, sql, '[]'], {
            encoding: 'utf8',
            env: { ...process.env, PYTHONUTF8: '1' },
        }),
    );
launch('install', true);
const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
});
const errors = [],
    requests = [],
    checks = [];
let context, page;
async function open() {
    context = await browser.newContext({
        viewport: { width: 1500, height: 1100 },
        timezoneId: 'Asia/Shanghai',
    });
    await context.route('**/*', (route) => {
        if (
            !route
                .request()
                .url()
                .startsWith(base + '/')
        ) {
            requests.push(route.request().url());
            return route.abort();
        }
        return route.continue();
    });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-22T04:00:00+08:00') });
    await page.goto(base);
    await page.locator('.sidebar').waitFor();
}
const nav = async (name) => {
    await page.locator(`.nav [data-page="${name}"]`).click();
};
const ws = (action) => page.locator(`[data-ws="${action}"]`);
const save = async () => {
    await page.locator('button[form=workspace-form]').click();
    await page.locator('#workspace-form').waitFor({ state: 'detached' });
};
const done = (label) => {
    checks.push(label);
    console.log('PASS:', label);
};
async function waitForState(predicate) {
    for (let i = 0; i < 60; i++) {
        const data = await state();
        if (predicate(data)) return data;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error('Timed out waiting for persisted state');
}
try {
    await open();
    assert.equal((await state()).orders.length, 0);
    assert.equal((await state()).portfolioImages.length, 0);
    await nav('templates');
    assert.equal(await page.locator('.rush-template').count(), 2);
    await page.screenshot({ path: path.join(output, 'empty-templates.png'), fullPage: true });
    await ws('rush-use').filter({ hasText: '使用模板' }).first().click();
    await page.locator('#order-form [name=title]').fill('限时24测试');
    assert.equal(await page.locator('#order-form [name=client]').getAttribute('required'), null);
    await page.locator('#save-order-btn').click();
    await page.locator('#order-form').waitFor({ state: 'detached' });
    let data = await state(),
        rush = data.orders[0];
    assert.equal(rush.rushHours, 24);
    assert.equal(rush.client, '');
    assert.equal(rush.category, '');
    assert.equal(rush.platform, '');
    assert.equal(Date.parse(rush.dueAt) - Date.parse(rush.startAt), 24 * 3600000);
    assert.equal(rush.due, '2026-10-23');
    assert.match(rush.dueAt, /T04:00:/);
    await ws('rush-use').nth(1).click();
    await page.locator('#order-form [name=title]').fill('限时48测试');
    await page.locator('#save-order-btn').click();
    await page.locator('#order-form').waitFor({ state: 'detached' });
    data = await state();
    assert.equal(
        Date.parse(data.orders[1].dueAt) - Date.parse(data.orders[1].startAt),
        48 * 3600000,
    );
    await ws('rush-style').first().click();
    await page.locator('#workspace-form [name=color]').fill('#496557');
    await save();
    assert.equal((await state()).rushStyles['24'], '#496557');
    done(
        '24h/48h use confirmation time, accept unassigned client/category/platform and save independent colors',
    );

    await nav('calendar');
    await page
        .locator(`[data-action=order-detail][data-id="${rush.id}"]`)
        .first()
        .getByText('04:00', { exact: false })
        .waitFor();
    await page.locator('[data-action=schedule-view][data-view=range]').click();
    await page.locator(`.schedule-range-event[data-id="${rush.id}"]`).first().waitFor();
    await page
        .locator(`.range-drag-handle[data-order-drag=move][data-id="${rush.id}"]`)
        .first()
        .dragTo(page.locator('[data-schedule-date="2026-10-25"]').first());
    data = await waitForState(
        (data) => data.orders.find((item) => item.id === rush.id).start === '2026-10-25',
    );
    let shifted = data.orders.find((item) => item.id === rush.id);
    assert.equal(shifted.due, '2026-10-26');
    assert.equal(Date.parse(shifted.dueAt) - Date.parse(shifted.startAt), 86400000);
    await page
        .locator(`.range-end-handle[data-id="${rush.id}"]`)
        .first()
        .dragTo(page.locator('[data-schedule-date="2026-10-28"]').first());
    data = await waitForState(
        (data) => data.orders.find((item) => item.id === rush.id).due === '2026-10-28',
    );
    assert.equal(data.orders.find((item) => item.id === rush.id).start, '2026-10-25');
    await page.locator('[data-action=schedule-view][data-view=deadline]').click();
    await page
        .locator(`.event[data-id="${rush.id}"]`)
        .first()
        .dragTo(page.locator('[data-schedule-date="2026-10-27"]').first());
    data = await waitForState(
        (data) => data.orders.find((item) => item.id === rush.id).due === '2026-10-27',
    );
    assert.equal(data.orders.find((item) => item.id === rush.id).start, '2026-10-25');
    await page.locator('[data-action=new-order]').first().click();
    await page.locator('#order-form [name=start]').click();
    await page.locator('.schedule-date-popover').waitFor();
    assert.ok(
        (await page.locator('.picker-day[data-date="2026-10-27"] .picker-marks i').count()) > 0,
    );
    await page.locator('.picker-day[data-date="2026-10-25"]').click();
    assert.equal(await page.locator('#order-form [name=start]').inputValue(), '2026-10-25');
    await page.locator('[data-action=close-modal]').first().click();
    done(
        'calendar start drag shifts both endpoints; end/deadline drag changes only due; date chooser displays existing schedule',
    );

    await nav('portfolio');
    assert.equal(await page.locator('.portfolio-image').count(), 0);
    await ws('folder-new').click();
    await page.locator('#workspace-form [name=name]').fill('测试作品册');
    await save();
    await ws('folder-open').filter({ hasText: '测试作品册' }).click();
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
    );
    const chooserPromise = page.waitForEvent('filechooser');
    await ws('portfolio-upload').click();
    await (
        await chooserPromise
    ).setFiles([
        { name: '测试图片一.png', mimeType: 'image/png', buffer: png },
        { name: '测试图片二.png', mimeType: 'image/png', buffer: png },
    ]);
    data = await waitForState((data) => data.portfolioImages.length === 2);
    assert.equal(data.portfolioImages[0].name, '测试图片一.png');
    assert.equal(data.portfolioImages[1].name, '测试图片二.png');
    assert.ok(data.portfolioImages.every((item) => item.folder === data.portfolioFolders[0].id));
    await page.locator('.portfolio-image').first().waitFor();
    await ws('album-next').click();
    await ws('album-next').click();
    await ws('album-next').click();
    assert.equal(await page.locator('.album-leaf.current').count(), 1);
    await page.screenshot({
        path: path.join(output, 'accordion-with-test-images.png'),
        fullPage: true,
    });
    await page.locator('[data-ws-select]').first().check();
    await page.locator('#portfolio-move-target').selectOption('');
    await ws('portfolio-move').click();
    data = await waitForState(
        (data) => data.portfolioImages.filter((item) => !item.folder).length === 1,
    );
    const raw = query("SELECT payload FROM desktop_records WHERE collection='portfolioImages'");
    assert.ok(
        raw.every((row) => row.payload.includes('@disk:') && !row.payload.includes('base64')),
    );
    await ws('folder-open').filter({ hasText: '全部作品' }).click();
    await ws('folder-rename').click();
    await page.locator('#workspace-form [name=name]').fill('已改名作品册');
    await save();
    assert.equal((await state()).portfolioFolders[0].name, '已改名作品册');
    done(
        'accordion remains open at last page; upload order, folders, rename, selection, image movement and private image files persist',
    );

    await nav('life');
    await page.locator('#life-quick-form [name=title]').fill('未定时测试事件');
    await page.locator('#life-quick-form button[type=submit]').click();
    await page.locator('.untimed-events').getByText('未定时测试事件', { exact: true }).waitFor();
    await ws('event-new').filter({ hasText: '新建事件' }).first().click();
    await page.locator('#workspace-form [name=title]').fill('有时间测试事件');
    await page.locator('.life-category-editor summary').click();
    await page.locator('#life-category-name').fill('测试日程类别');
    await ws('event-category-add').click();
    await page.locator('#workspace-form [name=start]').fill('2026-10-23T10:00');
    await page.locator('#workspace-form [name=end]').fill('2026-10-25T13:00');
    await page.locator('#workspace-form [name=content]').fill('测试内容');
    await save();
    data = await state();
    assert.equal(data.lifeEvents.length, 2);
    assert.equal(data.lifeCategories.length, 1);
    assert.equal(await page.locator('.life-calendar .event').count(), 0);
    await ws('events-full').click();
    await ws('event-toggle').first().click();
    assert.equal((await state()).lifeEvents.filter((item) => item.done).length, 1);
    await nav('calendar');
    await page
        .locator('.life-calendar-event')
        .getByText('有时间测试事件', { exact: true })
        .first()
        .waitFor();
    await page.locator('.life-calendar-event').first().click();
    await page.locator('#workspace-form [name=title]').waitFor();
    assert.equal(await page.locator('#workspace-form [name=title]').inputValue(), '有时间测试事件');
    await ws('dialog-close').click();
    done('untimed and timed events, custom categories, completion and manuscript-calendar links');

    await nav('life');
    await ws('life-tab').filter({ hasText: '生活健康' }).click();
    await ws('health-new').click();
    await page.locator('#health-kind').selectOption('water');
    await page.locator('#workspace-form [name=unit]').fill('杯');
    await save();
    const widget = (await state()).healthWidgets[0];
    await ws('health-toggle-controls').click();
    await ws('health-increase').click();
    await ws('health-increase').click();
    await ws('health-decrease').click();
    data = await state();
    assert.equal(data.healthLogs[0].value, 1);
    assert.equal(await page.locator('.health-chart-series').count(), 1);
    await ws('health-edit').click();
    const iconPromise = page.waitForEvent('filechooser');
    await ws('health-icon').click();
    await (
        await iconPromise
    ).setFiles({ name: '健康图标.png', mimeType: 'image/png', buffer: png });
    await page.locator('#health-icon-preview img').waitFor();
    await save();
    assert.ok(
        query(
            "SELECT payload FROM desktop_records WHERE collection='healthWidgets'",
        )[0].payload.includes('@disk:'),
    );
    done(
        'health component selection, uploaded icon, +/- counters and seven-day chart use persisted records',
    );

    await ws('life-tab').filter({ hasText: '食物转盘' }).click();
    for (const [kind, name] of [
        ['delivery', '测试外卖甲'],
        ['delivery', '测试外卖乙'],
        ['dish', '测试菜式'],
    ]) {
        await page.locator(`[data-ws=food-new][data-kind=${kind}]`).click();
        await page.locator('#workspace-form [name=name]').fill(name);
        await page.locator('#workspace-form [name=rating]').fill('4.5');
        await page.locator('#workspace-form [name=description]').fill('测试描述');
        await save();
    }
    await page.locator('[data-ws=food-spin][data-kind=delivery]').click();
    data = await waitForState((data) => !!data.foodLastChoices?.delivery);
    await page.locator('[data-slot=delivery] button').waitFor();
    await page.locator('[data-slot=delivery] button').click();
    assert.equal(await page.locator('#workspace-form [name=rating]').inputValue(), '4.5');
    await ws('dialog-close').click();
    assert.equal(await page.locator('.food-wheel-center').count(), 2);
    done(
        'two independent pointer-free wheels, animated slot result and editable rating/description',
    );

    await ws('life-tab').filter({ hasText: 'todolist' }).click();
    await page.locator('#todo-quick-form [name=title]').fill('测试想做的事情');
    await page.locator('#todo-quick-form button[type=submit]').click();
    await ws('todo-toggle').click();
    assert.equal((await state()).todoItems[0].done, true);
    await ws('todo-edit').click();
    await page.locator('#workspace-form [name=title]').fill('修改后的测试事项');
    await save();
    const before = await state();
    await context.close();
    await open();
    assert.deepEqual(await state(), before);
    await nav('life');
    await ws('life-tab').filter({ hasText: 'todolist' }).click();
    await page.getByText('修改后的测试事项', { exact: true }).waitFor();
    await context.close();
    launch('stop');
    launch('start');
    await open();
    assert.deepEqual(await state(), before);
    const backup = await api('backup', {});
    assert.ok(backup.path.startsWith(root));
    assert.equal(query('SELECT * FROM pragma_foreign_key_check').length, 0);
    const snapshot = await api('desktop-workspace');
    const sessionHeaders = { 'X-Lotus-Local': '1' };
    const { token } = await (
        await fetch(base + '/local-api/session', { headers: sessionHeaders })
    ).json();
    const stale = await fetch(base + '/local-api/desktop-workspace', {
        method: 'POST',
        headers: { ...sessionHeaders, 'X-Lotus-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: snapshot.data, baseRevision: snapshot.revision - 1 }),
    });
    assert.equal(stale.status, 409);
    done(
        'todo completion/edit, browser reopen, service restart, SQL relations, full backup and stale-write rejection',
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    await fs.writeFile(
        path.join(output, 'result.json'),
        JSON.stringify({ passed: true, checks, root, errors, externalRequests: requests }, null, 2),
    );
    console.log('ALL WORKSPACE UI CHECKS PASSED');
} catch (error) {
    if (page && !page.isClosed()) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        await fs.writeFile(path.join(output, 'failure.html'), await page.content());
    }
    console.error('Browser errors:', errors);
    throw error;
} finally {
    await browser.close();
    try {
        launch('stop');
    } catch (error) {
        console.error('Test cleanup:', error.message);
    }
}
