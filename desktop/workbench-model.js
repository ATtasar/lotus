// Shared rules for the requested desktop preview. Old backups remain readable.
export const EXTRA_COLLECTIONS = ['priceEntries', 'priceLists', 'replyFolders', 'replyTemplates'];
export const ended = (order) => ['完成', '退单'].includes(order.status);
export const orderAmount = (order) => Number(order.deposit) + Number(order.balance) + order.extras.reduce((sum, extra) => sum + Number(extra.amount), 0);
export function monthIncome(orders, month) {
  const monthly = orders.filter((order) => order.due.startsWith(month));
  return { actual: monthly.filter((order) => order.status === '完成').reduce((sum, order) => sum + orderAmount(order), 0), predicted: monthly.reduce((sum, order) => sum + orderAmount(order), 0) };
}
// Allocate non-overlapping tracks once for the visible interval. Keeping the
// same track across week rows prevents long commissions jumping between rows.
export function calendarRangeWeeks(orders, start, days = 7) {
  const ordinal = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  if (!Number.isInteger(days) || days < 7 || days > 84 || days % 7) throw new Error('日历范围必须为完整周。');
  const first = ordinal(start), last = first + days - 1;
  const visible = orders.map((order) => ({ order, begin: ordinal(order.start), end: ordinal(order.due) }))
    .filter((item) => item.begin <= last && item.end >= first)
    .sort((a, b) => Math.max(a.begin, first) - Math.max(b.begin, first) || a.end - b.end || a.order.id.localeCompare(b.order.id));
  const tracks = [];
  for (const item of visible) {
    const begin = Math.max(item.begin, first);
    let lane = tracks.findIndex((end) => end < begin);
    if (lane < 0) lane = tracks.length;
    tracks[lane] = item.end;
    item.lane = lane;
  }
  return Array.from({ length: days / 7 }, (_, week) => {
    const begin = first + week * 7, end = begin + 6;
    return visible.filter((item) => item.begin <= end && item.end >= begin).map((item) => {
      const left = Math.max(item.begin, begin), right = Math.min(item.end, end);
      return { order: item.order, lane: item.lane, column: left - begin + 1, span: right - left + 1, continuesBefore: item.begin < left, continuesAfter: item.end > right };
    });
  });
}
export function sortedClients(clients, orders) {
  const time = (value) => typeof value === 'string' ? Date.parse(value) || 0 : 0;
  const recent = (client) => orders.filter((o) => o.client === client.id).reduce((latest, o) => Math.max(latest, time(o.createdAt || o.created), time(o.start)), 0);
  return clients.map((client, index) => ({ client, index, added: time(client.importedAt || client.createdAt), recent: recent(client) }))
    .sort((a, b) => b.added - a.added || b.recent - a.recent || b.index - a.index).map(({ client }) => client);
}
export function updateOrderDates(order, previous, stamp = new Date().toISOString()) {
  if (!previous) order.createdAt ||= stamp;
  order.updatedAt = stamp;
  if (ended(order)) {
    if (!previous || !ended(previous) || order.status !== previous.status) order.endedAt = stamp;
    if (order.status === '完成' && previous?.status !== '完成') order.completedAt = stamp;
  } else {
    delete order.endedAt;
    delete order.completedAt;
  }
}
export const sortActive = (orders) => [...orders].sort((a, b) => (a.dueAt || a.due).localeCompare(b.dueAt || b.due) || (a.createdAt || a.created || '').localeCompare(b.createdAt || b.created || '') || a.id.localeCompare(b.id));
export const sortEnded = (orders) => [...orders].sort((a, b) => (b.endedAt || b.completedAt || b.due).localeCompare(a.endedAt || a.completedAt || a.due) || b.id.localeCompare(a.id));
export function paginate(items, page, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  page = Math.max(1, Math.min(pages, page));
  return { items: items.slice((page - 1) * size, page * size), page, pages, total: items.length };
}
export function validateExtras(data, safeImage, fail) {
  const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  const text = (value) => typeof value === 'string' && value.length <= 30000;
  const color = (value) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
  const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  for (const key of EXTRA_COLLECTIONS) {
    data[key] ??= [];
    if (!Array.isArray(data[key]) || data[key].length > 10000) fail('组件记录数量或格式不正确');
    const ids = new Set();
    for (const item of data[key]) {
      if (!item || !id(item.id) || ids.has(item.id)) fail('组件记录编号重复或不正确');
      ids.add(item.id);
    }
  }
  const entry = (item) => {
    if (!text(item.name) || !item.name.trim() || !number(item.price, 0, 10000000) || !text(item.description) || !color(item.bg) || !color(item.color) || !['cover', 'contain'].includes(item.fit) || (item.image && !safeImage(item.image))) fail('价目条目不正确');
  };
  data.priceEntries.forEach(entry);
  for (const list of data.priceLists) {
    if (!text(list.name) || !list.name.trim() || !color(list.bg) || !Number.isInteger(list.columns) || !number(list.columns, 1, 4) || !Number.isInteger(list.width) || !number(list.width, 600, 2400) || !number(list.cardHeight, 280, 900) || !number(list.gap, 8, 100) || !number(list.padding, 20, 120) || !Array.isArray(list.items) || list.items.length > 100 || (list.backgroundImage && !safeImage(list.backgroundImage))) fail('价目表设置不正确');
    const ids = new Set();
    list.items.forEach((item) => { if (!id(item.id) || ids.has(item.id)) fail('价目表条目编号重复'); ids.add(item.id); entry(item); });
    if (list.padding * 2 + list.gap * (list.columns - 1) + list.columns * 80 > list.width) fail('价目表列宽过小，请增加画布宽度或减少间距');
  }
  const folders = new Map(data.replyFolders.map((folder) => [folder.id, folder]));
  for (const folder of folders.values()) {
    if (!text(folder.name) || !folder.name.trim() || (folder.parent && !folders.has(folder.parent))) fail('快捷回复分组不正确');
    const seen = new Set([folder.id]);
    let parent = folder.parent;
    while (parent) { if (seen.has(parent)) fail('快捷回复分组不能循环嵌套'); seen.add(parent); parent = folders.get(parent)?.parent; }
  }
  const templates = new Set(data.templates.map((item) => item.id));
  for (const reply of data.replyTemplates) {
    if (!text(reply.title) || !reply.title.trim() || !text(reply.body) || (reply.parent && !folders.has(reply.parent)) || !Array.isArray(reply.templateIds) || new Set(reply.templateIds).size !== reply.templateIds.length || reply.templateIds.some((value) => !templates.has(value))) fail('快捷回复或关联稿件模板不正确');
  }
}
