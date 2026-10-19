// Shared desktop data model; additive fields retain old backup compatibility.
import { validateDesign } from './design-model.js';
const dateStr = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (s) => new Date(s + 'T12:00:00');
const allStages = (o) => [...o.stages, '退单'];
export function initialData() {
  return {
    version: 1,
    appearanceVersion: 2,
    categories: [],
    platforms: [],
    clients: [],
    archivedClients: [],
    orders: [],
    templates: [],
    assets: [],
    toolTemplates: [],
    current: '',
    profile: { name: '接稿工作台', artist: '管理员', tagline: '' },
  };
}
export function validateBackup(raw) {
  const fail = (message) => {
    throw new Error('备份格式无效：' + message);
  };
  if (
    !raw ||
    raw.version !== 1 ||
    !raw.profile ||
    typeof raw.profile.name !== 'string' ||
    typeof raw.profile.artist !== 'string' ||
    typeof raw.profile.tagline !== 'string'
  )
    fail('缺少工作室资料或版本不兼容');
  for (const key of ['platforms', 'clients', 'orders', 'templates', 'assets', 'toolTemplates'])
    if (!Array.isArray(raw[key])) fail('缺少 ' + key);
  raw.archivedClients ||= [];
  if (!Array.isArray(raw.archivedClients)) fail('单主历史不正确');
  if (
    raw.categories !== undefined &&
    (!Array.isArray(raw.categories) ||
      raw.categories.length > 10000 ||
      raw.categories.some(
        (value) =>
          typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 40,
      ) ||
      new Set(raw.categories).size !== raw.categories.length)
  )
    fail('稿件类别记录不正确');
  const safeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id),
    str = (v) => typeof v === 'string' && v.length <= 30000,
    num = (v, max = 10000000) => Number.isFinite(v) && v >= 0 && v <= max;
  const color = (v) => /^#[0-9a-f]{6}$/i.test(v),
    safeImage = (src) =>
      typeof src === 'string' &&
      (/^data:image\/(png|jpeg|webp|gif|bmp);base64,[a-z0-9+/=\r\n]+$/i.test(src) ||
        (() => {
          if (!src.startsWith('data:image/svg+xml;charset=utf-8,')) return false;
          try {
            const s = decodeURIComponent(src.split(',').slice(1).join(','));
            return (
              s.startsWith('<svg ') &&
              !/(script|foreignObject|href\s*=|on\w+\s*=|https?:|url\s*\()/i.test(
                s
                  .replace('http://www.w3.org/2000/svg', '')
                  .replace(/url\(\s*#[a-z0-9_-]+\s*\)/gi, ''),
              )
            );
          } catch {
            return false;
          }
        })());
  for (const key of [
    'platforms',
    'clients',
    'archivedClients',
    'orders',
    'templates',
    'assets',
    'toolTemplates',
  ]) {
    if (raw[key].length > 10000) fail('记录数量过多');
    const ids = new Set();
    for (const item of raw[key]) {
      if (!item || !safeId(item.id) || ids.has(item.id)) fail('记录编号不合法或重复');
      ids.add(item.id);
    }
  }
  const platforms = new Set(raw.platforms.map((p) => p.id)),
    clients = new Set([...raw.clients, ...raw.archivedClients].map((c) => c.id));
  for (const p of raw.platforms)
    if (!str(p.name) || !p.name.trim() || !color(p.color) || !num(p.fee, 100))
      fail('平台信息不正确');
  for (const c of [...raw.clients, ...raw.archivedClients]) {
    if (
      !str(c.name) ||
      !Array.isArray(c.platforms) ||
      !c.platforms.length ||
      c.platforms.some((id) => !platforms.has(id)) ||
      ['preferences', 'dislikes', 'requirements', 'notes'].some((k) => !str(c[k])) ||
      ['cn', 'salutation', 'platformLink'].some((k) => c[k] !== undefined && !str(c[k])) ||
      (c.platformLink && !/^https?:\/\/[^\s]+$/i.test(c.platformLink))
    )
      fail('单主信息不正确');
  }
  const validDate = (s) =>
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(parseDate(s).getTime()) &&
    dateStr(parseDate(s)) === s;
  for (const [type, items] of [
    ['orders', raw.orders],
    ['templates', raw.templates],
  ])
    for (const o of items) {
      if (
        !str(o.title) ||
        !o.title.trim() ||
        !str(o.category) ||
        !str(o.requirements) ||
        !platforms.has(o.platform) ||
        !num(o.deposit) ||
        !num(o.balance) ||
        !num(o.fee, 100)
      )
        fail('稿件基本信息不正确');
      if (
        !Array.isArray(o.stages) ||
        o.stages[0] !== '未开始' ||
        o.stages.at(-2) !== '成图' ||
        o.stages.at(-1) !== '完成' ||
        new Set(o.stages).size !== o.stages.length ||
        o.stages.length > 30 ||
        o.stages.some((s) => typeof s !== 'string' || !s.trim() || s.length > 40 || s === '退单')
      )
        fail('流程信息不正确');
      if (
        !Array.isArray(o.images) ||
        o.images.length > 12 ||
        o.images.some((src) => !safeImage(src))
      )
        fail('参考图片格式不正确');
      if (!Array.isArray(o.extras) || o.extras.some((x) => !str(x.name) || !num(x.amount)))
        fail('服务金额不正确');
      if (
        type === 'orders' &&
        (!clients.has(o.client) ||
          !validDate(o.start) ||
          !validDate(o.due) ||
          o.start > o.due ||
          !allStages(o).includes(o.status) ||
          typeof o.paid !== 'boolean' ||
          !str(o.notes))
      )
        fail('稿件日期、单主或状态不正确');
    }
  for (const a of raw.assets) if (!str(a.name) || !safeImage(a.src)) fail('素材不正确');
  for (const t of raw.toolTemplates) {
    if (!str(t.name) || !['receipt', 'card', 'layout'].includes(t.kind)) fail('组件模板不正确');
    if (t.kind === 'layout') {
      validateDesign(t.layout, safeImage, fail);
    } else if (
      !color(t.accent) ||
      ['brand', 'handle', 'message', 'subtitle'].some((k) => !str(t[k])) ||
      (t.image && !safeImage(t.image)) ||
      ['membership', 'cardNumber', 'itemText', 'customer', 'date', 'amount'].some(
        (k) => t[k] !== undefined && !str(t[k]),
      )
    )
      fail('小票或会员卡模板不正确');
    if (t.design !== undefined) validateDesign(t.design, safeImage, fail);
  }
  if (raw.watermarkMark && !safeImage(raw.watermarkMark)) fail('水印格式不正确');
  raw.current = raw.orders.some((o) => o.id === raw.current)
    ? raw.current
    : raw.orders[0]?.id || '';
  return raw;
}
// Preserve saved names and expose categories used by older records.
export function categoryChoices(data) {
  return [
    ...new Set(
      [
        ...(data.categories || []),
        ...data.orders.map((item) => item.category),
        ...data.templates.map((item) => item.category),
      ]
        .filter((value) => typeof value === 'string' && value.trim() && value.trim().length <= 40)
        .map((value) => value.trim()),
    ),
  ];
}
// Append imported copies with new identities while retaining PC settings.
export function mergeBackup(current, incoming) {
  const merged = validateBackup(structuredClone(current));
  const source = validateBackup(structuredClone(incoming));
  const allIds = new Set(
    [
      'platforms',
      'clients',
      'archivedClients',
      'orders',
      'templates',
      'assets',
      'toolTemplates',
    ].flatMap((key) => merged[key].map((item) => item.id)),
  );
  const newId = () => {
    let id;
    do {
      id =
        globalThis.crypto?.randomUUID?.() ||
        'import_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    } while (allIds.has(id));
    allIds.add(id);
    return id;
  };
  const platforms = new Map(),
    clients = new Map(),
    orders = new Map();
  for (const item of source.platforms) {
    const existing = merged.platforms.find((record) => record.name === item.name);
    const id = existing?.id || newId();
    platforms.set(item.id, id);
    if (!existing) merged.platforms.push({ ...item, id });
  }
  for (const key of ['clients', 'archivedClients'])
    for (const item of source[key]) {
      if (clients.has(item.id)) throw new Error('旧备份包含重复的单主编号，已取消合并。');
      const id = newId();
      clients.set(item.id, id);
      merged[key].push({
        ...item,
        id,
        platforms: item.platforms.map((value) => platforms.get(value)),
      });
    }
  for (const item of source.orders) {
    const id = newId();
    orders.set(item.id, id);
    merged.orders.push({
      ...item,
      id,
      platform: platforms.get(item.platform),
      client: clients.get(item.client),
    });
  }
  for (const item of source.templates)
    merged.templates.push({ ...item, id: newId(), platform: platforms.get(item.platform) });
  for (const item of source.assets) merged.assets.push({ ...item, id: newId() });
  for (const item of source.toolTemplates)
    merged.toolTemplates.push({
      ...item,
      id: newId(),
      ...(item.order ? { order: orders.get(item.order) || '' } : {}),
    });
  if (!merged.current) merged.current = orders.get(source.current) || '';
  if (!merged.watermarkMark && source.watermarkMark) merged.watermarkMark = source.watermarkMark;
  merged.categories = [...new Set([...categoryChoices(merged), ...categoryChoices(source)])];
  return validateBackup(merged);
}
