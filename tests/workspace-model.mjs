import assert from 'node:assert/strict';
import { setRushDates, moveOrderDates, eventOnDay } from '../desktop/workspace-model.js';
import { initialData, validateBackup, mergeBackup } from '../desktop/model.js';
const stamp = new Date('2026-10-22T04:00:00.123+08:00');
for (const rushHours of [24, 48]) {
    const order = setRushDates({ rushHours }, stamp);
    assert.equal(Date.parse(order.dueAt) - Date.parse(order.startAt), rushHours * 3600000);
    const moved = moveOrderDates(order, '2026-11-01', 'move');
    assert.equal(Date.parse(moved.dueAt) - Date.parse(moved.startAt), rushHours * 3600000);
    assert.equal(moved.dueAt.slice(11), order.dueAt.slice(11));
    const end = moveOrderDates(order, '2026-11-01', 'end');
    assert.equal(end.startAt, order.startAt);
    assert.equal(end.start, order.start);
    assert.equal(order.dueAt.slice(0, 10), order.due);
    assert.throws(() => moveOrderDates(order, '2020-01-01', 'end'));
}
assert.equal(
    eventOnDay({ start: '2026-10-22T10:00', end: '2026-10-24T11:00' }, '2026-10-23'),
    true,
);
assert.equal(eventOnDay({ start: '', end: '' }, '2026-10-23'), false);
const data = initialData();
data.portfolioFolders = [{ id: 'folder1', name: '测试', parent: '' }];
data.portfolioImages = [];
data.healthWidgets = [
    { id: 'widget1', name: '喝水', kind: 'water', unit: '杯', step: 1, icon: '' },
];
data.healthLogs = [{ id: 'log1', widget: 'widget1', date: '2026-10-22', value: 1 }];
const merged = mergeBackup(initialData(), data);
validateBackup(merged);
assert.notEqual(merged.healthWidgets[0].id, 'widget1');
assert.equal(merged.healthLogs[0].widget, merged.healthWidgets[0].id);
assert.equal(merged.portfolioFolders.length, 1);
console.log('PASS: fixed-hour timing, date moves, event spans and backup relationship remapping.');
