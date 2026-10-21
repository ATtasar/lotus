export const WORKSPACE_COLLECTIONS = [
    'portfolioFolders',
    'portfolioImages',
    'lifeCategories',
    'lifeEvents',
    'healthWidgets',
    'healthLogs',
    'foodEntries',
    'todoItems',
];
export const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const localStamp = (date) =>
    `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
export const rushColor = (data, hours) =>
    data.rushStyles?.[String(hours)] || (Number(hours) === 24 ? '#282828' : '#a1a1a1');
export function setRushDates(order, clock = new Date()) {
    const end = new Date(clock.getTime() + order.rushHours * 3600000);
    Object.assign(order, {
        start: dateKey(clock),
        due: dateKey(end),
        startAt: localStamp(clock),
        dueAt: localStamp(end),
    });
    return order;
}
export function orderDateLabel(order, field = 'due', compact = false) {
    const date = order[field],
        stamp = order[`${field}At`];
    if (!date) return '未填写';
    const label = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
    if (!stamp) return label;
    const time = stamp.slice(11, 16);
    return compact ? time : `${label} ${time}`;
}
export function moveOrderDates(original, target, mode) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) throw Error('请选择有效日期。');
    const order = structuredClone(original);
    const days = (a, b) => (Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000;
    const shift = (value, n) => {
        const d = new Date(value + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return dateKey(d);
    };
    if (mode === 'move') {
        const delta = days(target, order.start);
        order.start = target;
        order.due = shift(order.due, delta);
        if (order.startAt) order.startAt = order.start + order.startAt.slice(10);
        if (order.dueAt) order.dueAt = order.due + order.dueAt.slice(10);
    } else {
        if (target < order.start) throw Error('截止时间不能早于开始时间。');
        order.due = target;
        if (order.dueAt) order.dueAt = target + order.dueAt.slice(10);
        if (order.startAt && order.dueAt && new Date(order.dueAt) < new Date(order.startAt))
            throw Error('截止时间不能早于开始时间。');
    }
    order.updatedAt = new Date().toISOString();
    return order;
}
export function eventOnDay(event, date) {
    const start = (event.start || event.end || '').slice(0, 10),
        end = (event.end || event.start || '').slice(0, 10);
    return !!start && start <= date && date <= end;
}
export function validateWorkspaceFeatures(data, safeImage, fail) {
    const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
    const text = (value, max = 30000) => typeof value === 'string' && value.length <= max;
    const color = (value) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
    const stamp = (value) =>
        !value ||
        (typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
            Number.isFinite(Date.parse(value)));
    for (const key of WORKSPACE_COLLECTIONS) {
        data[key] ??= [];
        if (
            !Array.isArray(data[key]) ||
            data[key].length > 10000 ||
            data[key].some((item) => !item || !id(item.id)) ||
            new Set(data[key].map((item) => item.id)).size !== data[key].length
        )
            fail('工作空间记录无效：' + key);
    }
    const folders = new Map(data.portfolioFolders.map((item) => [item.id, item]));
    for (const item of folders.values()) {
        if (!text(item.name, 100) || !item.name.trim()) fail('文件夹名称不能为空');
        let parent = item.parent,
            seen = new Set([item.id]);
        while (parent) {
            if (!folders.has(parent) || seen.has(parent)) fail('文件夹关联无效');
            seen.add(parent);
            parent = folders.get(parent).parent;
        }
    }
    for (const item of data.portfolioImages)
        if (
            !text(item.name, 300) ||
            !safeImage(item.src) ||
            (item.folder && !folders.has(item.folder)) ||
            !stamp(item.addedAt)
        )
            fail('作品图片或文件夹无效');
    const categories = new Set(data.lifeCategories.map((item) => item.id));
    for (const item of data.lifeCategories)
        if (!text(item.name, 40) || !item.name.trim() || !color(item.color)) fail('事件类别无效');
    for (const item of data.lifeEvents)
        if (
            !text(item.title, 200) ||
            !item.title.trim() ||
            !text(item.content) ||
            !text(item.notes) ||
            typeof item.done !== 'boolean' ||
            (item.category && !categories.has(item.category)) ||
            !stamp(item.start) ||
            !stamp(item.end) ||
            (item.start && item.end && item.start > item.end)
        )
            fail('事件内容或时间无效');
    const widgets = new Set(data.healthWidgets.map((item) => item.id)),
        pairs = new Set();
    for (const item of data.healthWidgets)
        if (
            !text(item.name, 100) ||
            !item.name.trim() ||
            !['water', 'exercise', 'clean', 'custom'].includes(item.kind) ||
            !text(item.unit, 20) ||
            !Number.isFinite(item.step) ||
            item.step <= 0 ||
            item.step > 100000 ||
            (item.icon && !safeImage(item.icon))
        )
            fail('健康组件无效');
    for (const item of data.healthLogs) {
        const pair = item.widget + '/' + item.date;
        if (
            !widgets.has(item.widget) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
            !Number.isFinite(item.value) ||
            item.value < 0 ||
            item.value > 10000000 ||
            pairs.has(pair)
        )
            fail('健康记录无效');
        pairs.add(pair);
    }
    for (const item of data.foodEntries)
        if (
            !['delivery', 'dish'].includes(item.kind) ||
            !text(item.name, 100) ||
            !item.name.trim() ||
            !text(item.notes) ||
            !text(item.description) ||
            !Number.isFinite(item.rating) ||
            item.rating < 0 ||
            item.rating > 5
        )
            fail('转盘内容无效');
    for (const item of data.todoItems)
        if (!text(item.title, 300) || !item.title.trim() || typeof item.done !== 'boolean')
            fail('待办内容无效');
    if (
        data.rushStyles &&
        (typeof data.rushStyles !== 'object' ||
            Array.isArray(data.rushStyles) ||
            Object.entries(data.rushStyles).some(
                ([key, value]) => !['24', '48'].includes(key) || !color(value),
            ))
    )
        fail('特殊模板颜色无效');
    if (
        data.portfolioCover &&
        (!text(data.portfolioCover.title || '', 100) ||
            !color(data.portfolioCover.color || '#242424') ||
            (data.portfolioCover.image && !safeImage(data.portfolioCover.image)))
    )
        fail('作品封面无效');
}
export function mergeWorkspaceFeatures(merged, source, newId) {
    const remap = (key) => new Map(source[key].map((item) => [item.id, newId()]));
    const folders = remap('portfolioFolders'),
        categories = remap('lifeCategories'),
        widgets = remap('healthWidgets');
    for (const item of source.portfolioFolders)
        merged.portfolioFolders.push({
            ...item,
            id: folders.get(item.id),
            parent: folders.get(item.parent) || '',
        });
    for (const item of source.portfolioImages)
        merged.portfolioImages.push({
            ...item,
            id: newId(),
            folder: folders.get(item.folder) || '',
        });
    for (const item of source.lifeCategories)
        merged.lifeCategories.push({ ...item, id: categories.get(item.id) });
    for (const item of source.lifeEvents)
        merged.lifeEvents.push({
            ...item,
            id: newId(),
            category: categories.get(item.category) || '',
        });
    for (const item of source.healthWidgets)
        merged.healthWidgets.push({ ...item, id: widgets.get(item.id) });
    for (const item of source.healthLogs)
        merged.healthLogs.push({ ...item, id: newId(), widget: widgets.get(item.widget) });
    for (const key of ['foodEntries', 'todoItems'])
        for (const item of source[key]) merged[key].push({ ...item, id: newId() });
    merged.rushStyles ??= structuredClone(source.rushStyles || {});
    merged.portfolioCover ??= structuredClone(
        source.portfolioCover || { title: '', color: '#242424', image: '' },
    );
}
