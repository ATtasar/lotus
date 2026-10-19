import { initialData, validateBackup, mergeBackup, categoryChoices } from './model.js';
import { storage } from './storage.js';
import { createDesign, prepareDesign } from './design-model.js';
import { designerControls, drawDesign, bindDesigner, addDesignImages } from './designer.js';
('use strict');
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const e = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const dateStr = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseDate = (s) => new Date(s + 'T12:00:00');
  const addDays = (date, n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  };
  const now = () => new Date();
  const today = () => dateStr(now());
  const monday = (date) => addDays(date, -((date.getDay() + 6) % 7));
  const shortDate = (s) => (s ? `${Number(s.slice(5, 7))}月${Number(s.slice(8))}日` : '未设置');
  const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m4 0h2m-8 3h2"/>',
    orders:
      '<path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m7 12 2 2 4-4m-6 8h10m-2-6h2"/>',
    clients:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
    templates:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12m4-8h4m-4 4h4"/>',
    tools: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    settings:
      '<path d="m9 3-1 3-3 1-1 3 2 2-1 3 2 2 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-2-2-3 1-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-6-6L3 21"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8m-8 4h8m-8 4h3"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20m-16 5h4m4 0h3"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 10h18c0-3-3-3-3-10m-8 13h4"/>',
    heart: '<path d="M20 4a5 5 0 0 0-8 2 5 5 0 0 0-8-2c-6 6 8 16 8 16S26 10 20 4Z"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3V6Z"/>',
  };
  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.tools}</svg>`;
  const btn = (label, action, cls = '', attrs = '') =>
    `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  const iconBtn = (name, action, title, attrs = '') =>
    `<button type="button" class="icon-btn" data-action="${action}" title="${e(title)}" aria-label="${e(title)}" ${attrs}>${icon(name)}</button>`;
  function grayColor(value) {
    const hex = String(value || '#888888');
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#888888';
    const n = Math.round(
      0.2126 * parseInt(hex.slice(1, 3), 16) +
        0.7152 * parseInt(hex.slice(3, 5), 16) +
        0.0722 * parseInt(hex.slice(5, 7), 16),
    )
      .toString(16)
      .padStart(2, '0');
    return '#' + n + n + n;
  }
  function migrateAppearance() {
    let changed = false;
    const set = (record, key, value) => {
      if (record[key] !== value) {
        record[key] = value;
        changed = true;
      }
    };
    const oldColors = ['#c8d9b5', '#edc2d1', '#c6d8da', '#e4d3b6'],
      tones = ['#323232', '#777777', '#ababab', '#d0d0d0'];
    data.platforms.forEach((p) =>
      set(
        p,
        'color',
        oldColors.includes(p.color) ? tones[oldColors.indexOf(p.color)] : grayColor(p.color),
      ),
    );
    const migrateImage = (src) => {
      if (typeof src !== 'string' || !src.startsWith('data:image/svg+xml;charset=utf-8,'))
        return src;
      try {
        const svg = decodeURIComponent(src.split(',').slice(1).join(','));
        if (!svg.includes('A LITTLE MOMENT OF BLOOM')) return src;
        changed = true;
        return (
          'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(
            svg
              .replace(/<text x="28"[^>]*>A LITTLE MOMENT OF BLOOM<\/text>/, '')
              .replace(/#[0-9a-f]{6}/gi, grayColor),
          )
        );
      } catch {
        return src;
      }
    };
    [...data.orders, ...data.templates].forEach((o) => {
      o.images = o.images.map(migrateImage);
    });
    if (data.appearanceVersion !== 2) {
      if (data.profile.name === '未完工作室') set(data.profile, 'name', '接稿工作台');
      if (data.profile.artist === '未完') set(data.profile, 'artist', '管理员');
      if (data.profile.tagline === '慢慢画，也好好生活。') set(data.profile, 'tagline', '');
      const defaults = {
        'receipt-default': {
          name: ['温柔来信', '标准小票'],
          message: [
            '谢谢你，让我的画成为你生活的一小部分。\n期待和你的下一次相遇 ♡',
            '稿件已按约定交付，修改事项请联系画师。',
          ],
          subtitle: ['THANK YOU FOR YOUR LOVELY SUPPORT', '稿件交付凭证'],
        },
        'card-default': {
          name: ['花园会员卡', '标准会员卡'],
          message: ['把每一次相遇，收藏成一座花园。', '会员资料以工作室登记信息为准。'],
          subtitle: ['A LITTLE CLUB OF LOVELY PEOPLE', '会员资料'],
        },
      };
      data.toolTemplates.forEach((t) => {
        const preset = defaults[t.id];
        if (preset)
          for (const [key, [oldValue, newValue]] of Object.entries(preset))
            if (t[key] === oldValue) set(t, key, newValue);
        if (t.brand === '未完工作室') set(t, 'brand', '接稿工作台');
        if (t.handle === '小红书 @未完的画') set(t, 'handle', '');
        if (t.membership === '花园常客') set(t, 'membership', '普通会员');
        if (t.cardNumber === 'STILL 0001') set(t, 'cardNumber', '0001');
      });
      [...data.clients, ...(data.archivedClients || [])].forEach((c) => {
        if (c.notes === '老朋友啦，沟通时可以直接称呼梨奈。')
          set(c, 'notes', '确认配色后开始细化。');
        if (c.preferences === '低饱和粉绿、自然光、温柔的氛围感')
          set(c, 'preferences', '低饱和度、自然光、背景留白');
      });
      data.appearanceVersion = 2;
      changed = true;
    }
    data.toolTemplates.forEach((t) => {
      if (t.accent) set(t, 'accent', grayColor(t.accent));
      if (t.layout?.bg && t.layout.version !== 1) set(t.layout, 'bg', grayColor(t.layout.bg));
    });
    return changed;
  }
  const artwork = () =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#f3f3f3"/><g transform="translate(279 129)" stroke="#b7b7b7" stroke-width="2" fill="none"><rect width="42" height="42" rx="4"/><circle cx="12" cy="12" r="3"/><path d="m2 38 12-13 7 6 9-11 10 14"/></g></svg>',
    );
  let data,
    saveQueue = Promise.resolve(),
    pendingSaves = 0,
    failedSave = false;
  let interactionBusy = 0,
    syncing = false,
    syncMessage = '',
    remoteNotice = -1;
  const disabledDuringSave = new WeakMap();
  let page = ['home', 'calendar', 'orders', 'clients', 'templates', 'tools'].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : 'home';
  let weekOffset = 0,
    monthDate = new Date(now().getFullYear(), now().getMonth(), 1),
    platformFilter = '',
    statusFilter = '',
    search = '',
    selected = new Set(),
    tool = '',
    modal = null,
    lastFocus = null;
  let draft = null,
    toolConfig = null,
    layout = { items: [], selected: -1, width: 1000, height: 1000, bg: '#efefef' },
    watermark = { mark: null, image: null, opacity: 0.55, size: 70, position: 'center' };
  let layoutTemplateId = '',
    layoutTemplateName = '';
  let toastTimer;
  let localInfo,
    toolDirty = false;
  function hasUnsavedChanges() {
    return pendingSaves > 0 || failedSave || !!modal?.dirty || toolDirty;
  }
  function markToolDirty() {
    toolDirty = true;
    updateSaveStatus();
  }
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  for (const name of ['input', 'change'])
    document.addEventListener(
      name,
      (event) => {
        if (
          modal &&
          event.target.closest('#order-form,#client-form,#settings-form,#platform-form')
        ) {
          modal.dirty = true;
          updateSaveStatus();
        }
        if (tool && tool !== 'watermark' && event.target.closest('.tool-settings')) markToolDirty();
      },
      true,
    );
  const platform = (id) =>
    data.platforms.find((p) => p.id === id) || { name: '未分类', color: '#dadada', fee: 0 };
  const client = (id) =>
    data.clients.find((c) => c.id === id) ||
    (data.archivedClients || []).find((c) => c.id === id) || {
      name: '已删除单主',
      preferences: '',
      dislikes: '',
      notes: '',
      requirements: '',
    };
  const gross = (o) =>
    Number(o.deposit || 0) +
    Number(o.balance || 0) +
    (o.extras || []).reduce((n, x) => n + Number(x.amount || 0), 0);
  const net = (o) => Math.round(gross(o) * (1 - Number(o.fee || 0) / 100) * 100) / 100;
  const received = (o) =>
    o.status === '退单'
      ? 0
      : o.paid
        ? net(o)
        : Math.round(Number(o.deposit || 0) * (1 - Number(o.fee || 0) / 100) * 100) / 100;
  const allStages = (o) => [...o.stages, '退单'];
  function toast(message) {
    clearTimeout(toastTimer);
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }
  function persist() {
    data.categories = categoryChoices(data);
    const snapshot = clone(data);
    pendingSaves++;
    updateSaveStatus();
    // Serialize durable commits so rapid interactions cannot reorder snapshots.
    saveQueue = saveQueue
      .then(() => storage.save(snapshot))
      .then(() => {
        failedSave = false;
        return true;
      })
      .catch((error) => {
        failedSave = true;
        toast(error.message || '本次保存失败，请先导出备份，再检查本机服务和磁盘空间。');
        return false;
      })
      .finally(() => {
        pendingSaves--;
        updateSaveStatus();
      });
    return saveQueue;
  }
  function updateSaveStatus() {
    document
      .querySelectorAll(
        '#order-form input,#order-form select,#order-form textarea,#client-form input,#client-form textarea,#platform-form input,#settings-form input,button[form]',
      )
      .forEach((field) => {
        if (pendingSaves) {
          if (!disabledDuringSave.has(field)) disabledDuringSave.set(field, field.disabled);
          field.disabled = true;
        } else if (disabledDuringSave.has(field)) {
          field.disabled = disabledDuringSave.get(field);
          disabledDuringSave.delete(field);
        }
      });
    const el = $('#save-status');
    if (el)
      el.innerHTML = failedSave
        ? '保存失败 · 请导出备份'
        : pendingSaves
          ? '正在保存…'
          : modal?.dirty
            ? '表单有未保存修改'
            : toolDirty
              ? '组件模板有未保存修改'
              : syncMessage || '<span class="live-dot"></span>已保存到电脑';
  }
  function canRefresh() {
    return (
      !modal &&
      !tool &&
      !selected.size &&
      !pendingSaves &&
      !failedSave &&
      !interactionBusy &&
      !document.activeElement?.matches('input,textarea,select,[contenteditable=true]')
    );
  }
  async function refreshRemote() {
    if (syncing || !data || document.hidden || failedSave) return;
    syncing = true;
    try {
      const version = await storage.remoteRevision();
      if (version > storage.version()) {
        if (!canRefresh()) {
          syncMessage = '其他页面有更新 · 结束编辑后同步';
          if (remoteNotice !== version) {
            remoteNotice = version;
            toast('其他页面已更新。当前输入会保留；保存时会检查冲突。');
          }
        } else {
          const snapshot = await storage.readRemote();
          if (canRefresh() && snapshot.revision > storage.version()) {
            data = storage.acceptRemote(snapshot);
            data.categories = categoryChoices(data);
            watermark.mark = data.watermarkMark || null;
            syncMessage = '';
            render();
          }
        }
      } else syncMessage = '';
      updateSaveStatus();
    } catch (error) {
      if (syncMessage !== '电脑连接中断 · 未同步') toast(error.message);
      syncMessage = '电脑连接中断 · 未同步';
      updateSaveStatus();
    } finally {
      syncing = false;
    }
  }
  async function boot() {
    data = await storage.load();
    localInfo = await storage.info();
    data.categories = categoryChoices(data);
    if (migrateAppearance() && !(await persist()))
      throw new Error('数据外观迁移未保存，请先导出备份。');
    render();
    setInterval(
      refreshRemote,
      Math.max(1000, Math.min(30000, window.LOTUS_CONFIG?.pollIntervalMs || 3000)),
    );
    window.addEventListener('focus', refreshRemote);
    document.addEventListener('visibilitychange', refreshRemote);
  }
  const navItems = [
    ['home', '主页', 'home'],
    ['orders', '稿件管理', 'orders'],
    ['clients', '单主管理', 'clients'],
    ['calendar', '日历展示', 'calendar'],
    ['tools', '功能组件', 'tools'],
    ['templates', '稿件模板', 'templates'],
  ];
  const pageNames = Object.fromEntries(navItems.map((n) => [n[0], n[1]]));
  function render() {
    const count = data.orders.filter((o) => !['完成', '退单'].includes(o.status)).length;
    const currentName = tool && page === 'tools' ? toolNames[tool] : pageNames[page];
    $('#app').innerHTML =
      `<aside class="sidebar"><a href="#home" class="brand" data-action="nav" data-page="home"><div class="brand-mark">稿</div><div class="brand-name">${e(data.profile.name)}<small>个人接稿管理</small></div></a><div class="nav-label">工作空间</div><nav class="nav" aria-label="主要导航">${navItems.map(([id, label, ic]) => `<button type="button" data-action="nav" data-page="${id}" class="${page === id ? 'active' : ''}" title="${label}" aria-label="${label}" ${page === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${id === 'orders' ? `<span class="nav-count">${count}</span>` : ''}</button>`).join('')}</nav><div class="sidebar-spacer"></div><div class="sidebar-storage"><div class="row">${icon('folder')} 本地工作空间</div><p>资料保存在本地电脑<br>可在设置中导出备份</p></div><div class="sidebar-foot"><button class="profile" data-action="settings" aria-label="工作室设置"><div class="avatar">${e(data.profile.artist.slice(0, 1))}</div><div><strong>${e(data.profile.artist)}</strong><small>工作台设置</small></div>${icon('settings')}</button></div></aside><div class="shell"><header class="topbar"><div class="breadcrumb">工作空间 ${icon('chevron')}<span>${currentName}</span></div><div class="top-actions"><span class="small muted" id="save-status"><span class="live-dot"></span>已自动保存</span><button class="pill-outline" data-action="settings">本地存储</button>${iconBtn('bell', 'reminders', '截稿提醒')}</div></header><main class="content" id="main-content">${{ home: renderHome, orders: renderOrders, clients: renderClients, calendar: renderCalendar, templates: renderTemplates, tools: renderTools }[page]()}<footer class="footer"><span>${e(data.profile.name)} · 本地工作空间</span><span>数据保存在本地电脑</span></footer></main></div>`;
    updateSaveStatus();
    if (page === 'tools' && tool) drawCurrentTool();
  }

  function intro(_eyebrow, title, desc, action = 'new-order', label = '新建稿件') {
    const amounts = {
      orders: data.orders.length,
      clients: data.clients.length,
      templates: data.templates.length,
    };
    const count = amounts[page];
    const ongoing = data.orders.filter((o) => !['完成', '退单'].includes(o.status));
    const start = dateStr(monday(now())),
      end = dateStr(addDays(monday(now()), 6));
    const due = ongoing.filter((o) => o.due >= start && o.due <= end).length;
    const summary =
      page === 'home'
        ? `<div class="intro-summary"><span class="intro-stat"><strong>${String(ongoing.length).padStart(2, '0')}</strong>待处理稿件</span><span class="intro-stat"><strong>${String(due).padStart(2, '0')}</strong>本周截稿</span></div>`
        : '';
    return `<div class="page-intro"><div><div class="page-heading"><h1>${title}</h1>${count !== undefined ? `<span class="page-count">${count}</span>` : ''}</div><p>${desc}</p></div><div class="intro-actions">${summary}${action ? btn(icon('plus') + label, action, 'primary') : ''}</div></div>`;
  }

  function legend() {
    return data.platforms
      .map(
        (p) =>
          `<span class="platform-tag" style="--platform:${p.color}"><i class="dot"></i>${e(p.name)}</span>`,
      )
      .join('');
  }
  function eventButton(o, kind = '截止') {
    return `<button class="event" data-action="order-detail" data-id="${o.id}" style="--platform:${platform(o.platform).color}" title="${e(o.title)} · ${e(client(o.client).name)} · ${kind}"><strong>${e(o.title)}</strong><small>${e(client(o.client).name)} · ${kind}</small></button>`;
  }
  function stagesHTML(o) {
    const idx = o.stages.indexOf(o.status);
    return `<div class="stages">${o.stages.map((s, i) => `<button class="stage ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}" data-action="set-stage" data-id="${o.id}" data-stage="${e(s)}" title="切换到${e(s)}"><span class="stage-ball">${i < idx ? icon('check') : ''}</span>${e(s)}</button>`).join('')}</div>`;
  }
  function renderHome() {
    const d = addDays(monday(now()), weekOffset * 7),
      end = addDays(d, 6);
    const active = data.orders.filter((o) => !['完成', '退单'].includes(o.status));
    const current = data.orders.find((o) => o.id === data.current) || active[0] || data.orders[0];
    return (
      intro(
        '',
        '工作概览',
        `${shortDate(today())}，星期${'日一二三四五六'[now().getDay()]} · 查看本周排期与当前稿件。`,
      ) +
      `<section class="panel week-panel"><div class="panel-header"><div class="panel-title">${icon('calendar')}<h2>本周排期<span class="panel-subtitle">开始日期与截稿日期</span></h2></div><div class="week-toolbar"><strong>${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} — ${end.getMonth() + 1}.${String(end.getDate()).padStart(2, '0')}</strong>${iconBtn('left', 'week-prev', '上一周')}${btn('本周', 'week-today', 'small')}${iconBtn('chevron', 'week-next', '下一周')}</div></div><div class="week-grid">${Array.from(
        { length: 7 },
        (_, i) => {
          const dd = addDays(d, i),
            s = dateStr(dd);
          const events = active.flatMap((o) => [
            ...(o.start === s ? [{ o, kind: '开始' }] : []),
            ...(o.due === s ? [{ o, kind: '截稿' }] : []),
          ]);
          return `<div class="week-day ${s === today() ? 'today' : ''}"><div class="day-heading"><span>周${'一二三四五六日'[i]}</span><span class="day-number">${String(dd.getDate()).padStart(2, '0')}</span></div>${events.map((x) => eventButton(x.o, x.kind)).join('') || '<div class="no-event">暂无安排</div>'}</div>`;
        },
      ).join(
        '',
      )}</div><div class="row week-legend"><span class="grow">${icon('clock')} 开始 / 截稿</span><div class="legend">${legend()}</div>${btn('查看月历 ' + icon('arrow'), 'nav', 'small', 'data-page="calendar"')}</div></section>` +
      `<section class="panel current-panel"><div class="panel-header"><div class="current-title"><i class="tiny-dot"></i><h2>当前稿件</h2>${current ? `<span class="badge">${e(current.status)}</span>` : ''}</div><div class="row">${current ? btn('切换稿件', 'choose-current', 'small') : ''}${current ? iconBtn('edit', 'edit-order', '编辑当前稿件', `data-id="${current.id}"`) : ''}</div></div>${current ? renderCurrent(current) : `<div class="empty">${icon('image')}<p>尚未选择当前稿件。</p><br>${btn('新建稿件', 'new-order', 'green')}</div>`}</section>`
    );
  }
  function renderCurrent(o) {
    const c = client(o.client),
      p = platform(o.platform),
      idx = o.stages.indexOf(o.status),
      percent = Math.max(0, Math.round((idx / (o.stages.length - 1)) * 100));
    return `<div class="current-body"><div class="art-region"><div class="art-frame">${o.images.length ? `<img src="${e(o.images[0])}" alt="${e(o.title)}参考图片" data-action="lightbox" data-id="${o.id}"><span class="image-label">设定参考图</span>` : `<button style="width:100%;height:100%" data-action="add-order-image" data-id="${o.id}"><div class="empty">${icon('image')}<p>上传或拖入稿件参考图</p><p class="small">点击上传或直接拖到这里</p></div></button>`}</div><div class="art-controls"><div class="thumbs">${o.images
      .slice(0, 4)
      .map(
        (img, i) =>
          `<button class="thumb ${i === 0 ? 'active' : ''}" data-action="switch-image" data-id="${o.id}" data-index="${i}" aria-label="查看第${i + 1}张参考图"><img src="${e(img)}" alt="参考图 ${i + 1}"></button>`,
      )
      .join(
        '',
      )}<button class="thumb add" data-action="add-order-image" data-id="${o.id}" aria-label="添加参考图片">${icon('plus')}</button></div><div class="image-caption">${icon('image')} ${o.images.length} 张参考图</div></div></div><div class="order-info"><div class="order-topline"><span class="platform-tag" style="--platform:${p.color}"><i class="dot"></i>${e(p.name)}</span><span class="order-number">编号 ${String(data.orders.indexOf(o) + 1).padStart(4, '0')}</span></div><h2 class="order-title">${e(o.title)}</h2><div class="order-meta"><span>${icon('calendar')}${shortDate(o.start)}开始</span><span>${icon('clock')}${shortDate(o.due)}截稿</span><span>${e(o.category)}</span></div><div class="client-line"><div class="avatar">${e(c.name.slice(0, 1))}</div><div><strong>${e(c.name)}</strong><small>关联单主</small></div><button data-action="client-detail" data-id="${o.client}">单主档案 ${icon('chevron')}</button></div><div class="requirements"><div class="requirement-row"><label>稿件要求</label><p>${e(o.requirements || '未填写')}</p></div><div class="requirement-row"><label>单主偏好</label><p>${e(c.preferences || '未填写')}</p></div><div class="requirement-row"><label>注意雷点</label><p>${e(c.dislikes || '未填写')}</p></div>${c.requirements ? `<div class="requirement-row"><label>单主要求</label><p>${e(c.requirements)}</p></div>` : ''}<div class="requirement-row"><label>备注</label><p>${e(o.notes || c.notes || '无备注')}</p></div></div><div class="progress-label"><span>制作进度</span><span>${percent}% · ${e(o.status)}</span></div>${stagesHTML(o)}<div class="order-bottom"><div class="amount">${money(gross(o))}<small>定金 ${money(o.deposit)}${o.paid ? ' · 已结清' : ''}</small></div>${btn('查看完整稿件 ' + icon('arrow'), 'order-detail', 'small', `data-id="${o.id}"`)}</div></div></div>`;
  }
  function filtered(items) {
    return items.filter(
      (o) =>
        (!platformFilter ||
          o.platform === platformFilter ||
          o.platforms?.includes(platformFilter)) &&
        (!statusFilter || o.status === statusFilter) &&
        (!search ||
          [
            o.title,
            o.name,
            o.category,
            o.preferences,
            o.cn,
            o.salutation,
            o.platformLink,
            o.notes,
            o.client ? client(o.client).name : '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  }
  function toolbar(type) {
    return `<div class="toolbar"><label class="searchbox">${icon('search')}<input id="list-search" placeholder="${type === 'clients' ? '搜索单主名称、偏好…' : '搜索稿件、单主或类别…'}" value="${e(search)}" aria-label="搜索"></label><select class="filter" id="platform-filter" aria-label="筛选平台"><option value="">全部平台</option>${platformOptions(platformFilter)}</select>${type === 'orders' ? `<select class="filter" id="status-filter" aria-label="筛选状态"><option value="">全部状态</option>${[...new Set(['未开始', '草稿', '线稿', '上色', '成图', '完成', '退单', ...data.orders.flatMap((o) => o.stages)])].map((s) => `<option ${s === statusFilter ? 'selected' : ''}>${e(s)}</option>`).join('')}</select>` : ''}<span class="grow"></span><span class="toolbar-count">${selected.size ? `已选择 ${selected.size} 项` : ''}</span>${btn(icon('settings') + '平台管理', 'platform-manager', 'small')}${btn('全选', 'select-all', 'small', `data-type="${type}"`)}</div>${selected.size ? `<div class="batchbar">${icon('check')} 已选择 ${selected.size} 项<span class="grow"></span>${btn('取消选择', 'deselect-all', 'small')}${btn(icon('trash') + '删除所选', 'delete-selected', 'small danger', `data-type="${type}"`)}</div>` : ''}`;
  }
  function platformOptions(value) {
    return data.platforms
      .map(
        (p) => `<option value="${p.id}" ${p.id === value ? 'selected' : ''}>${e(p.name)}</option>`,
      )
      .join('');
  }
  function renderOrders() {
    const items = filtered(data.orders).sort((a, b) => a.due.localeCompare(b.due));
    return (
      intro('', '稿件管理', '统一管理稿件信息、制作进度与交付日期。') +
      toolbar('orders') +
      `<section class="panel list-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th><input type="checkbox" data-action="select-all-check" data-type="orders" aria-label="全选稿件" ${items.length && items.every((o) => selected.has(o.id)) ? 'checked' : ''}></th><th>稿件 / 项目名称</th><th>单主</th><th>平台</th><th>截稿日期</th><th>创作状态</th><th>稿件金额</th><th></th></tr></thead><tbody>${items.map((o) => `<tr data-action="order-detail" data-id="${o.id}"><td><input type="checkbox" class="entity-select" data-id="${o.id}" ${selected.has(o.id) ? 'checked' : ''} aria-label="选择${e(o.title)}"></td><td><div class="row">${o.images[0] ? `<span class="thumb"><img src="${e(o.images[0])}" alt=""></span>` : `<span class="thumb" style="display:grid;place-items:center;color:#b7b7b7">${icon('image')}</span>`}<div><span class="cell-title">${e(o.title)}</span><small>${e(o.category)} · ${shortDate(o.start)}开始</small></div></div></td><td>${e(client(o.client).name)}</td><td><span class="platform-tag" style="--platform:${platform(o.platform).color}"><i class="dot"></i>${e(platform(o.platform).name)}</span></td><td>${shortDate(o.due)}${o.due < today() && !['完成', '退单'].includes(o.status) ? '<span class="badge pink" style="margin-left:5px">已逾期</span>' : ''}</td><td><span class="badge ${o.status === '退单' ? 'pink' : o.status === '未开始' ? 'neutral' : ''}">${e(o.status)}</span></td><td>${money(gross(o))}<br><small>${o.paid ? '已结清' : '已收定金 ' + money(o.deposit)}</small></td><td>${iconBtn('edit', 'edit-order', '编辑稿件', `data-id="${o.id}"`)}</td></tr>`).join('')}</tbody></table></div>${!items.length ? '<div class="empty">没有符合条件的稿件，试试其他关键词。</div>' : ''}<div class="table-total">共 ${items.length} 份稿件 · 平台标识同步显示在日历中</div></section>`
    );
  }
  function clientGradient(c) {
    const cols = c.platforms.map((id) => platform(id).color);
    return cols.length > 1 ? `linear-gradient(90deg,${cols.join(',')})` : cols[0] || '#e1e1e1';
  }
  function renderClients() {
    const items = filtered(data.clients);
    return (
      intro('', '单主管理', '管理单主资料、沟通要求及关联稿件。', 'new-client', '新建单主') +
      toolbar('clients') +
      `<section class="panel client-directory"><div class="directory-summary"><span>单主资料 <strong>${items.length}</strong> 位</span><span>点击查看完整档案</span></div><div class="directory-labels"><span></span><span>单主</span><span>所属平台</span><span>偏好摘要</span><span>关联稿件</span><span class="align-right">委托总额</span><span></span></div><div class="cards-grid clients-grid">${items
        .map((c) => {
          const orders = data.orders.filter((o) => o.client === c.id);
          const count = orders.filter((o) => !['完成', '退单'].includes(o.status)).length;
          return `<article class="entity-card client-row" data-action="client-detail" data-id="${c.id}"><div class="color-strip" style="background:${clientGradient(c)}"></div><input type="checkbox" class="entity-check entity-select" data-id="${c.id}" aria-label="选择${e(c.name)}" ${selected.has(c.id) ? 'checked' : ''}><div class="client-identity"><div class="avatar">${e(c.name.slice(0, 1))}</div><div><h3>${e(c.name)}</h3><small>${c.salutation ? e(c.salutation) + ' · ' : ''}合作 ${orders.filter((o) => o.status !== '退单').length} 次</small></div></div><div class="client-platforms">${c.platforms.map((id) => `<span class="platform-tag" style="--platform:${platform(id).color}"><i class="dot"></i>${e(platform(id).name)}</span>`).join('')}</div><p class="client-bio">${e(c.preferences || '未填写偏好')}</p><span class="client-count">${orders.length}<small>份</small></span><span class="client-revenue">${money(orders.filter((o) => o.status !== '退单').reduce((a, o) => a + gross(o), 0))}</span>${iconBtn('chevron', 'client-detail', '查看单主档案', `data-id="${c.id}"`)}</article>`;
        })
        .join(
          '',
        )}</div>${!items.length ? '<div class="empty">暂无符合条件的单主。</div>' : ''}<div class="client-directory-foot">共 ${items.length} 位单主 · 单主资料与稿件关联更新</div></section>`
    );
  }

  function renderTemplates() {
    const items = filtered(data.templates);
    return (
      intro('', '稿件模板', '保存常用的稿件类型、价格和制作流程。', 'new-template', '新建模板') +
      toolbar('templates') +
      `<div class="cards-grid">${items.map((t) => `<article class="entity-card template-card" data-action="edit-template" data-id="${t.id}" style="--platform:${platform(t.platform).color}"><div class="color-strip"></div><div class="template-hero"><img src="${e(t.images[0] || artwork(0))}" alt="${e(t.title)}模板预览"><span class="badge">${e(platform(t.platform).name)}</span><input type="checkbox" class="entity-check entity-select" data-id="${t.id}" aria-label="选择${e(t.title)}" ${selected.has(t.id) ? 'checked' : ''}></div><div class="entity-body"><h3>${e(t.title)}</h3><p>${e(t.category)} · ${t.stages.length} 个流程节点</p><div class="row between"><span class="template-amount">${money(gross(t))}<small> / 起</small></span>${btn('使用模板 ' + icon('arrow'), 'use-template', 'small green', `data-id="${t.id}"`)}</div><div class="entity-bottom" style="margin-top:18px"><span>平台费 ${t.fee}% · 可在稿件中自由修改</span><span>编辑 ${icon('chevron')}</span></div></div></article>`).join('')}</div>${!items.length ? '<div class="panel empty">当前平台暂无稿件模板。</div>' : ''}`
    );
  }
  function renderCalendar() {
    const y = monthDate.getFullYear(),
      m = monthDate.getMonth(),
      prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const start = monday(new Date(y, m, 1)),
      days =
        Math.ceil((((new Date(y, m, 1).getDay() + 6) % 7) + new Date(y, m + 1, 0).getDate()) / 7) *
        7;
    const orders = data.orders.filter((o) => !platformFilter || o.platform === platformFilter);
    const monthOrders = orders.filter((o) => o.due.startsWith(prefix) && o.status !== '退单');
    const total = monthOrders.reduce((n, o) => n + received(o), 0),
      expected = monthOrders.reduce((n, o) => n + net(o), 0);
    const groups = (key, mapper) => {
      const obj = {};
      monthOrders.forEach((o) => {
        const id = o[key];
        if (!obj[id])
          obj[id] = {
            label: mapper(id),
            value: 0,
            color:
              key === 'platform'
                ? platform(id).color
                : ['#cfcfcf', '#cacaca', '#d8d8d8', '#d9d9d9'][Object.keys(obj).length % 4],
          };
        obj[id].value += received(o);
      });
      return Object.values(obj).sort((a, b) => b.value - a.value);
    };
    return (
      intro('', '日历展示', '按截止日期查看稿件排期，统计当月收入。') +
      `<div class="toolbar"><select class="filter" id="platform-filter" aria-label="日历平台筛选"><option value="">全部平台</option>${platformOptions(platformFilter)}</select><span class="grow"></span>${btn(icon('settings') + '平台标识', 'platform-manager', 'small')}</div><section class="panel"><div class="calendar-header"><div class="month-title">${y}年${m + 1}月<small>截稿日程</small></div><div class="row">${iconBtn('left', 'month-prev', '上个月')}${btn('本月', 'month-today', 'small')}${iconBtn('chevron', 'month-next', '下个月')}</div></div><div class="month-scroll"><div class="month-grid">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((s) => `<div class="weekday">${s}</div>`).join('')}${Array.from(
        { length: days },
        (_, i) => {
          const d = addDays(start, i),
            s = dateStr(d),
            items = orders.filter((o) => o.due === s);
          return `<div class="month-cell ${d.getMonth() !== m ? 'outside' : ''} ${s === today() ? 'today' : ''}" data-action="day-detail" data-date="${s}"><span class="date">${d.getDate()}</span>${items.map((o) => eventButton(o, o.status === '退单' ? '已退单' : '截稿')).join('')}</div>`;
        },
      ).join(
        '',
      )}</div></div><div class="calendar-foot"><div class="legend">${legend()}</div><span class="small muted">${monthOrders.length} 份稿件 · 点击空白日期新增排期</span></div></section><section class="income-section"><div class="income-title"><div><div class="eyebrow">收入统计</div><h2 style="margin-top:7px">${m + 1}月收入</h2><div class="income-total">${money(total)}<small>本月实收净额</small></div></div><span class="badge">预计净收入 ${money(expected)}</span></div><p class="settings-note" style="margin:-6px 0 18px">按截稿月份归集，实收为已结清订单的全款或未结清订单的定金，均扣除平台费；退单不计入。</p><div class="income-cards"><article class="stat-card"><h3>平台收入</h3>${renderDonut(
        groups('platform', (id) => platform(id).name),
        total,
      )}</article><article class="stat-card"><h3>稿件类别收入</h3><span class="muted">按稿件类别 · 实收</span>${renderBars(groups('category', (id) => id))}</article><article class="stat-card"><h3>单主收入</h3><span class="muted">按单主 · 实收</span>${renderBars(groups('client', (id) => client(id).name))}</article></div></section>`
    );
  }
  function renderBars(groups) {
    const max = Math.max(1, ...groups.map((g) => g.value));
    return groups.length
      ? groups
          .map(
            (g) =>
              `<div class="bar-row"><span title="${e(g.label)}">${e(g.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(g.value / max) * 100}%;--platform:${g.color}"></div></div><span class="money">${money(g.value)}</span></div>`,
          )
          .join('')
      : '<div class="empty" style="padding:25px 0">本月暂无收入记录。</div>';
  }
  function renderDonut(groups, total) {
    let pos = 0;
    const stops = groups
      .filter((g) => g.value > 0)
      .map((g) => {
        const from = pos;
        pos += (g.value / total) * 100;
        return `${g.color} ${from}% ${pos}%`;
      });
    return `<div class="donut-layout"><div class="donut" style="background:${stops.length ? `conic-gradient(${stops.join(',')})` : '#f0f0f0'}"><span>${groups.length} 平台</span></div><div class="chart-legend">${groups.map((g) => `<div style="--platform:${g.color}"><i class="dot"></i>${e(g.label)}<span style="margin-left:auto;padding-left:6px">${money(g.value)}</span></div>`).join('') || '暂无收入'}</div></div>`;
  }
  const toolNames = {
    watermark: '水印合成',
    receipt: '交付小票',
    card: '会员卡',
    layout: '例图排版',
  };
  function renderTools() {
    if (tool) return renderToolEditor();
    return (
      intro('', '功能组件', '处理稿件图片，生成交付凭证与常用素材。', null) +
      `<div class="tools-grid">${[
        [
          'watermark',
          'layers',
          '水印合成',
          '上传原图与透明水印，调整位置和透明度，复制或导出合成结果。',
        ],
        [
          'receipt',
          'receipt',
          '交付小票',
          '关联稿件，自动填写单主、项目和金额，生成可导出的交付凭证。',
        ],
        ['card', 'card', '会员卡', '编辑会员信息、卡号和卡面，保存模板并导出图片。'],
        ['layout', 'image', '例图排版', '在画布中移动、缩放和排列图片，保存布局并导出排版结果。'],
      ]
        .map(
          ([id, ic, title, desc], i) =>
            `<button class="tool-card" data-action="open-tool" data-tool="${id}"><span class="tool-icon">${icon(ic)}</span><h3>${title} ${icon('arrow')}</h3><p>${desc}</p><span class="tool-index">0${i + 1}</span></button>`,
        )
        .join(
          '',
        )}</div><section class="panel assets-panel" data-drop="assets"><div class="row between"><div><h3>素材库</h3><p class="settings-note" style="margin-top:5px">拖入常用图片，水印、小票、会员卡和排版都可以重复使用。</p></div>${btn(icon('plus') + '上传素材', 'upload-assets', 'small')}</div><div class="asset-grid">${data.assets.map((a) => `<div class="asset-item"><img src="${e(a.src)}" alt="${e(a.name)}" title="${e(a.name)}"><button data-action="delete-asset" data-id="${a.id}" title="删除素材" aria-label="删除${e(a.name)}">×</button></div>`).join('')}<button class="asset-add" data-action="upload-assets">${icon('upload')}拖放 / 上传</button></div></section>`
    );
  }
  function initTool(kind) {
    tool = kind;
    if (kind === 'receipt' || kind === 'card') {
      const base = data.toolTemplates.find((t) => t.kind === kind);
      toolConfig = clone(
        base || {
          kind,
          name: '',
          brand: '',
          handle: '',
          message: '',
          accent: '#e4e4e4',
          subtitle: '',
          image: '',
        },
      );
      toolConfig.order = data.current || data.orders[0]?.id || '';
      const o = data.orders.find((o) => o.id === toolConfig.order);
      toolConfig.customer = o ? client(o.client).name : toolConfig.customer || '';
      toolConfig.membership = toolConfig.membership || '';
      toolConfig.cardNumber = toolConfig.cardNumber || '';
    }
  }
  function renderToolEditor() {
    const title = toolNames[tool];
    const top = `<div class="row" style="margin-bottom:20px">${btn(icon('left') + '全部组件', 'tools-back', 'small')}<span class="grow"></span><span class="settings-note"></span></div>`;
    const header = intro(
      '',
      title,
      tool === 'watermark'
        ? '上传原图与透明水印，预览并导出合成结果。'
        : tool === 'layout'
          ? '拖动图片自由排版。点击选中，调整大小、角度和图层。'
          : '选择关联订单，自动填入单主与购买内容；文字和图片都可以修改。',
      null,
    );
    if (tool === 'watermark')
      return (
        top +
        header +
        `<div class="tool-workspace"><section class="panel tool-settings"><h3>图片来源</h3><div class="watermark-grid"><div class="dropzone checker" data-drop="watermark-mark" data-action="upload-mark">${watermark.mark ? `<img src="${e(watermark.mark)}" alt="透明水印">` : `${icon('layers')}`}<span>透明水印</span></div><span class="merge-plus">+</span><div class="dropzone" data-drop="watermark-image" data-action="upload-base">${watermark.image ? `<img src="${e(watermark.image)}" alt="原图">` : icon('image')}<span>原图</span></div></div><p class="hint">点击或拖入 PNG / JPG / WebP。透明水印推荐使用 PNG。</p><div class="divider"></div><label class="field"><span>水印不透明度</span><div class="field-range"><input id="wm-opacity" type="range" min="5" max="100" value="${watermark.opacity * 100}"><span id="wm-opacity-value">${Math.round(watermark.opacity * 100)}%</span></div></label><label class="field"><span>水印宽度 / 原图宽度</span><div class="field-range"><input id="wm-size" type="range" min="5" max="100" value="${watermark.size}"><span id="wm-size-value">${watermark.size}%</span></div></label><label class="field"><span>水印位置</span><select id="wm-position">${[
          ['center', '居中'],
          ['bottom-right', '右下角'],
          ['bottom-left', '左下角'],
          ['top-right', '右上角'],
          ['top-left', '左上角'],
          ['tile', '平铺'],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${watermark.position === v ? 'selected' : ''}>${l}</option>`,
          )
          .join(
            '',
          )}</select></label><div class="row">${btn('清除原图', 'clear-base', 'small')}${btn('清除水印', 'clear-mark', 'small')}</div>${assetPicker('watermark')}<p class="hint" style="margin-top:18px">换原图时，水印会留下来。水印也会保存在本地电脑，下次打开继续用。</p></section><section class="panel preview-panel"><div class="eyebrow" style="margin-bottom:20px">合成预览</div><canvas id="output-canvas" width="800" height="650" aria-label="水印合成结果预览"></canvas><div class="canvas-actions">${btn(icon('copy') + '复制图片', 'copy-output', 'primary')}${btn(icon('download') + '保存 PNG', 'export-png')}${btn('JPG', 'export-jpg', 'small')}</div></section></div>`
      );
    if (tool === 'layout') return top + header + renderLayoutEditor();
    return renderComponentEditor(top, header);
  }
  function componentValue(key) {
    const c = toolConfig || {},
      o = data.orders.find((item) => item.id === c.order);
    if (key === 'itemText')
      return o
        ? [o.title, ...o.extras.map((x) => `${x.name} ${money(x.amount)}`)].join('\n')
        : c.itemText || '';
    if (key === 'amount') return o ? money(gross(o)) : c.amount || '';
    if (key === 'date') return o ? o.due : c.date || '';
    if (key === 'cardNumber') return c.cardNumber ? '卡号 ' + c.cardNumber : '';
    return c[key] || '';
  }
  function ensureToolDesign() {
    if (!toolConfig.design) {
      toolConfig.design = createDesign(tool, toolConfig);
      if (toolConfig.image)
        toolConfig.design.items.push({
          kind: 'image',
          name: '原模板图片',
          src: toolConfig.image,
          x: toolConfig.design.width * 0.7,
          y: toolConfig.design.height * 0.7,
          scale: 30,
          rotation: 0,
          visible: true,
        });
    }
    return toolConfig.design;
  }
  function renderComponentEditor(top, header) {
    const c = toolConfig,
      design = ensureToolDesign();
    const fields = [
      ['customer', '单主名称'],
      ['brand', '工作室 / 画师名称'],
      ['handle', '平台名称、账号或联系方式'],
      ...(tool === 'card'
        ? [
            ['membership', '会员称呼'],
            ['cardNumber', '卡号'],
          ]
        : []),
      ['itemText', '稿件内容（未关联时）'],
      ['amount', '金额（未关联时）'],
      ['date', '日期（未关联时）'],
      ['message', '附加说明'],
      ['subtitle', '凭证说明'],
    ];
    return (
      top +
      header +
      `<div class="tool-saved-list">${btn('新建空白模板', 'new-tool-template', 'small')}${data.toolTemplates
        .filter((t) => t.kind === tool)
        .map(
          (t) =>
            `<button class="${t.id === c.id ? 'active' : ''}" data-action="load-tool-template" data-id="${t.id}">${e(t.name)}</button>`,
        )
        .join(
          '',
        )}</div><div class="tool-workspace"><section class="panel tool-settings"><label class="field"><span>关联稿件（可选）</span><select id="tool-order"><option value="">不关联，手动填写</option>${data.orders
        .filter((o) => o.status !== '退单')
        .map(
          (o) =>
            `<option value="${o.id}" ${o.id === c.order ? 'selected' : ''}>${e(o.title)} · ${e(client(o.client).name)}</option>`,
        )
        .join(
          '',
        )}</select></label><details open><summary>文字信息（均为选填）</summary><div class="form-grid">${fields.map(([key, label]) => `<label class="field"><span>${label}</span>${['handle', 'message'].includes(key) ? `<textarea data-tool-field="${key}">${e(c[key] || '')}</textarea>` : `<input data-tool-field="${key}" value="${e(c[key] || '')}">`}</label>`).join('')}</div></details><div class="divider"></div>${designerControls(design, componentValue, tool)}<div class="dropzone" data-drop="tool-image" data-action="upload-tool-image">${icon('image')}拖入 / 上传图片到画布</div>${assetPicker('tool')}<div class="divider"></div><label class="field"><span>模板名称</span><input data-tool-field="name" value="${e(c.name)}"></label><div class="row design-actions">${btn('另存为新模板', 'save-tool-template', 'small green')}${c.id ? btn('更新当前模板', 'update-tool-template', 'small') + iconBtn('trash', 'delete-tool-template', '删除当前模板') : ''}</div></section><section class="panel preview-panel" data-drop="tool-image"><div class="eyebrow">${tool === 'card' ? '会员卡预览' : '小票预览'}</div><canvas id="output-canvas" tabindex="0" aria-label="${toolNames[tool]}实时预览，点击并拖动文字或图片"></canvas><div class="canvas-actions">${btn(icon('copy') + '复制图片', 'copy-output', 'primary')}${btn('PNG', 'export-png')}${btn('JPG', 'export-jpg')}${btn('PDF', 'export-pdf')}</div></section></div>`
    );
  }
  function assetPicker(mode) {
    return data.assets.length
      ? `<div style="margin-top:18px"><p class="hint">从素材库选一张${mode === 'watermark' ? '作为水印' : ''}</p><div class="layout-assets">${data.assets.map((a) => `<button data-action="use-asset" data-id="${a.id}" data-mode="${mode}" title="${e(a.name)}"><img src="${e(a.src)}" alt="${e(a.name)}"></button>`).join('')}</div></div>`
      : '';
  }
  function renderLayoutEditor() {
    layout = prepareDesign(layout);
    return `<div class="tool-saved-list">${btn('新建空白模板', 'new-layout-template', 'small')}${data.toolTemplates
      .filter((t) => t.kind === 'layout')
      .map(
        (t) =>
          `<span class="row"><button data-action="load-layout-template" data-id="${t.id}" class="${t.id === layoutTemplateId ? 'active' : ''}">${e(t.name)}</button><button data-action="delete-tool-template" data-id="${t.id}" aria-label="删除${e(t.name)}模板">×</button></span>`,
      )
      .join(
        '',
      )}</div><div class="tool-workspace"><section class="panel tool-settings">${designerControls(layout, () => '', 'layout')}<div class="dropzone" data-drop="layout" data-action="upload-layout">${icon('upload')}拖入图片素材 / 点击上传</div>${assetPicker('layout')}<div class="divider"></div><label class="field"><span>模板名称</span><input id="layout-template-name" value="${e(layoutTemplateName)}" placeholder="请输入模板名称"></label><div class="row design-actions">${btn('另存为新模板', 'save-layout-template', 'small green')}${layoutTemplateId ? btn('更新当前模板', 'update-layout-template', 'small') : ''}</div><p class="hint">拖动文字和图片。方向键微调，删除键移除图层。导出时隐藏选中框。</p></section><section class="panel preview-panel" data-drop="layout"><canvas id="output-canvas" tabindex="0" aria-label="自由排版画布，点击并拖动文字或图片"></canvas><div class="canvas-actions">${btn(icon('copy') + '复制图片', 'copy-output', 'primary')}${btn('PNG', 'export-png')}${btn('JPG', 'export-jpg')}${btn('PDF', 'export-pdf')}</div></section></div>`;
  }
  function showModal(title, body, foot = '', cls = '') {
    if (!$('#modal-root').firstElementChild) lastFocus = document.activeElement;
    $('#modal-root').innerHTML =
      `<div class="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="modal-head"><h2>${title}</h2>${iconBtn('close', 'close-modal', '关闭')}</div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</section></div>`;
    document.body.style.overflow = 'hidden';
    $('#app').inert = true;
    requestAnimationFrame(() => {
      // Do not steal focus if the user already entered another field before
      // the next animation frame (keep focus within the current form).
      if ($('#modal-root').contains(document.activeElement)) return;
      const f = $('input:not([type=checkbox]):not([type=file]),select,textarea', $('#modal-root'));
      (f || $('.modal-head button'))?.focus();
    });
  }
  function closeModal() {
    modal = null;
    draft = null;
    $('#modal-root').innerHTML = '';
    $('#app').inert = false;
    document.body.style.overflow = '';
    lastFocus?.isConnected && lastFocus.focus();
    updateSaveStatus();
    setTimeout(refreshRemote, 0);
  }
  function confirmAction(title, text, callback) {
    modal = { type: 'confirm', callback };
    showModal(
      title,
      `<p style="font-size:12px;color:#909090;line-height:2">${text}</p>`,
      btn('取消', 'close-modal') + btn('确认删除', 'confirm-action', 'danger'),
      'narrow',
    );
  }
  function openOrderEditor(id = null, isTemplate = false, provided = null) {
    const source = (isTemplate ? data.templates : data.orders).find((o) => o.id === id);
    draft = clone(
      provided ||
        source || {
          id: uid(),
          title: '',
          platform: data.platforms[0]?.id || '',
          client: '',
          category: '',
          deposit: 0,
          balance: 0,
          extras: [],
          fee: data.platforms[0]?.fee || 0,
          stages: ['未开始', '成图', '完成'],
          status: '未开始',
          start: today(),
          due: '',
          requirements: '',
          notes: '',
          images: [],
          paid: false,
          created: today(),
        },
    );
    modal = { type: isTemplate ? 'template-editor' : 'order-editor', isNew: !source };
    renderOrderEditor();
  }
  function renderOrderEditor() {
    const isTemplate = modal.type === 'template-editor',
      o = draft,
      p = platform(o.platform),
      filteredClients = data.clients.filter((c) => c.platforms.includes(o.platform)),
      templates = data.templates.filter((t) => t.platform === o.platform);
    showModal(
      `${modal.isNew ? '新建' : '编辑'}${isTemplate ? '稿件模板' : '稿件'}`,
      `<form id="order-form"><div class="modal-section"><div class="section-label"><span class="number">01</span> 基本信息</div><div class="form-grid"><label class="field"><span>所属平台 *</span><div class="field-inline"><select name="platform" required><option value="">选择平台</option>${platformOptions(o.platform)}</select>${iconBtn('plus', 'inline-platform', '新建平台')}</div></label>${!isTemplate ? `<label class="field"><span>快速使用模板（可选）</span><select id="order-template"><option value="">从空白稿件开始</option>${templates.map((t) => `<option value="${t.id}">${e(t.title)}</option>`).join('')}</select></label>` : ''}</div><div id="inline-platform-form" class="hidden" style="padding:15px;background:#f8f8f8;border-radius:9px;margin-top:15px"><div class="form-grid"><label class="field"><span>新平台名称</span><input id="new-platform-name" maxlength="24" placeholder="平台名称"></label><label class="field"><span>标识灰度</span><input type="color" id="new-platform-color" value="#cecece"></label><label class="field"><span>默认平台费 / %</span><input type="number" id="new-platform-fee" min="0" max="100" value="0"></label><div class="row" style="align-items:end">${btn('添加并选择', 'save-inline-platform', 'small green')}</div></div></div><div class="form-grid" style="margin-top:15px"><label class="field ${isTemplate ? 'full' : ''}"><span>${isTemplate ? '模板' : '稿件'}名称 *</span><input name="title" required maxlength="100" value="${e(o.title)}" placeholder="请输入名称"></label>${!isTemplate ? `<label class="field"><span>单主 *</span><div class="field-inline"><select name="client" required><option value="">选择此平台的单主</option>${filteredClients.map((c) => `<option value="${c.id}" ${c.id === o.client ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select>${iconBtn('plus', 'quick-client', '新建单主')}</div></label>` : ''}<label class="field"><span>稿件类别 *</span><div class="field-inline"><input name="category" required maxlength="40" value="${e(o.category)}" placeholder="输入新类别">${
        categoryChoices(data).length
          ? `<select id="category-choice" aria-label="选择已保存的稿件类别"><option value="">选择已有类别</option>${categoryChoices(
              data,
            )
              .map(
                (value) =>
                  `<option value="${e(value)}" ${value === o.category ? 'selected' : ''}>${e(value)}</option>`,
              )
              .join('')}</select>`
          : ''
      }</div><small class="hint">保存后记住类别，下次可直接选择。</small></label><div class="field"><span>平台标识</span><div class="row" style="height:38px"><span style="background:${p.color};width:25px;height:25px;border-radius:6px"></span><span class="small muted">保存后会同步到日历与列表</span></div></div></div></div><div class="modal-section"><div class="section-label"><span class="number">02</span> 费用设置</div><div class="form-grid"><label class="field"><span>定金 / 元 *</span><input type="number" name="deposit" min="0" max="10000000" step="0.01" required value="${o.deposit}"></label><label class="field"><span>尾款 / 元 *</span><input type="number" name="balance" min="0" max="10000000" step="0.01" required value="${o.balance}"></label><label class="field"><span>平台费率 / %</span><input type="number" name="fee" min="0" max="100" step="0.01" value="${o.fee}"></label>${!isTemplate ? `<div class="field"><span>收款状态</span><label class="check-row" style="height:38px"><input type="checkbox" name="paid" ${o.paid ? 'checked' : ''}> 已收到全部款项</label></div>` : ''}</div><div style="margin-top:14px"><div class="row between" style="margin-bottom:9px"><span class="settings-note">额外服务（计入总金额）</span>${btn(icon('plus') + '添加服务', 'add-service', 'small')}</div><div id="service-rows">${o.extras.map((x, i) => serviceHTML(x, i)).join('')}</div></div><div class="money-preview"><span>稿件总额 <span id="gross-preview">${money(gross(o))}</span> · 扣除平台费后</span><strong id="net-preview">${money(net(o))}</strong></div></div><div class="modal-section"><div class="section-label"><span class="number">03</span> 制作流程与排期</div><span class="hint">保留默认流程，可勾选中间步骤并添加自定义流程。</span><div class="check-options">${[...new Set([...o.stages.slice(1, -2), '草稿', '线稿', '上色'])].map((s) => `<label class="check-row"><input name="optional-stage" type="checkbox" value="${e(s)}" ${o.stages.includes(s) ? 'checked' : ''}>${e(s)}</label>`).join('')}</div><div class="row" style="margin:12px 0"><input id="custom-stage-name" maxlength="40" placeholder="自定义流程名称" aria-label="自定义流程名称">${btn('添加流程', 'add-custom-stage', 'small')}</div>${
        !isTemplate
          ? `<div class="form-grid"><label class="field"><span>开始日期（不填则为今天）</span><input type="date" name="start" value="${o.start}"></label><label class="field"><span>截止日期 *</span><input type="date" name="due" required value="${o.due}"></label><label class="field"><span>当前状态</span><select name="status">${allStages(
              o,
            )
              .map((s) => `<option ${s === o.status ? 'selected' : ''}>${e(s)}</option>`)
              .join('')}</select></label></div>`
          : ''
      }</div><div class="modal-section"><div class="section-label"><span class="number">04</span> ${isTemplate ? '通用要求与示例图' : '设定、要求与参考图'}（可选）</div><label class="field"><span>${isTemplate ? '通用稿件说明' : '这份稿件的具体要求'}</span><textarea name="requirements" placeholder="请输入稿件的具体要求">${e(o.requirements)}</textarea></label>${!isTemplate ? `<label class="field"><span>稿件备注</span><textarea name="notes" placeholder="请输入补充备注" style="min-height:54px">${e(o.notes)}</textarea></label>` : ''}<div class="dropzone" data-drop="draft" data-action="upload-draft">${icon('upload')}拖入设定图片 / 点击上传 <span class="small">· 可留空</span></div><div class="upload-previews">${o.images.map((img, i) => `<div class="upload-preview"><img src="${e(img)}" alt="参考图${i + 1}"><button type="button" data-action="remove-draft-image" data-index="${i}" aria-label="移除参考图${i + 1}">×</button></div>`).join('')}</div></div></form>`,
      `${!modal.isNew ? btn(icon('trash') + '删除', 'delete-draft', 'danger left') : ''}${btn('取消', 'close-modal')}<button type="submit" form="order-form" class="btn primary" id="save-order-btn">${icon('check')} 保存${isTemplate ? '模板' : '稿件'}</button>`,
    );
  }
  function serviceHTML(x, i) {
    return `<div class="service-row"><input class="service-name" placeholder="服务名称" maxlength="60" value="${e(x.name)}" required aria-label="额外服务名称"><input class="service-amount" type="number" min="0" max="10000000" step="0.01" value="${x.amount}" required aria-label="额外服务金额">${iconBtn('close', 'remove-service', '移除服务', `data-index="${i}"`)}</div>`;
  }
  function captureDraft() {
    const f = $('#order-form');
    if (!f) return;
    const fd = new FormData(f);
    [
      'title',
      'platform',
      'client',
      'category',
      'start',
      'due',
      'status',
      'requirements',
      'notes',
    ].forEach((k) => {
      if (fd.has(k)) draft[k] = String(fd.get(k)).trim();
    });
    ['deposit', 'balance', 'fee'].forEach((k) => {
      if (fd.has(k)) draft[k] = Number(fd.get(k));
    });
    draft.paid = fd.get('paid') === 'on';
    draft.stages = ['未开始', ...fd.getAll('optional-stage'), '成图', '完成'];
    if (modal?.type === 'template-editor') delete draft.duration;
    if (!draft.stages.includes(draft.status) && draft.status !== '退单') draft.status = '未开始';
    draft.extras = $$('.service-row', f).map((row) => ({
      name: $('.service-name', row).value.trim(),
      amount: Number($('.service-amount', row).value),
    }));
  }
  function openClientEditor(id = null, returnOrder = false) {
    const c =
      data.clients.find((c) => c.id === id) ||
      (data.archivedClients || []).find((c) => c.id === id);
    const previous = returnOrder ? { draft: clone(draft), modal: { ...modal } } : null;
    modal = { type: 'client-editor', id, previous };
    draft = clone(
      c || {
        id: uid(),
        name: '',
        platforms: [previous?.draft.platform || data.platforms[0]?.id].filter(Boolean),
        preferences: '',
        dislikes: '',
        notes: '',
        requirements: '',
      },
    );
    renderClientEditor();
  }
  function renderClientEditor() {
    const c = draft;
    showModal(
      `${modal.id ? '编辑' : '新建'}单主`,
      `<form id="client-form"><label class="field"><span>单主名称 *</span><input name="name" maxlength="60" required value="${e(c.name)}" placeholder="请输入单主名称"></label><div class="field"><span>所在平台（可多选）*</span><div class="check-options">${data.platforms.map((p) => `<label class="check-row"><input type="checkbox" name="platforms" value="${p.id}" ${c.platforms.includes(p.id) ? 'checked' : ''}><i class="dot" style="--platform:${p.color}"></i>${e(p.name)}</label>`).join('')}</div>${btn(icon('plus') + '新建平台', 'inline-platform', 'small')}</div><div id="inline-platform-form" class="hidden"><div class="form-grid"><label class="field"><span>平台名称</span><input id="new-platform-name"></label><label class="field"><span>标识灰度</span><input id="new-platform-color" type="color" value="#cccccc"></label></div><input id="new-platform-fee" type="hidden" value="0">${btn('添加并选择', 'save-inline-platform', 'small green')}</div><div class="form-grid" style="margin-top:17px">${[
        ['cn', 'CN（选填）'],
        ['salutation', '称呼（选填）'],
        ['platformLink', '平台链接（选填）'],
      ]
        .map(
          ([key, label]) =>
            `<label class="field"><span>${label}</span><input name="${key}" ${key === 'platformLink' ? 'type="url" placeholder="https://"' : ''} maxlength="2000" value="${e(c[key] || '')}"></label>`,
        )
        .join('')}${[
        ['preferences', '偏好', '喜欢的配色、画风、构图…'],
        ['dislikes', '雷点', '不希望出现的内容…'],
        ['requirements', '要求', '每次委托都需要记住的要求…'],
        ['notes', '备注', '沟通习惯、交付偏好等'],
      ]
        .map(
          ([key, label, placeholder]) =>
            `<label class="field"><span>${label}</span><textarea name="${key}" placeholder="${placeholder}">${e(c[key])}</textarea></label>`,
        )
        .join('')}</div></form>`,
      btn('取消', 'cancel-client') +
        `<button type="submit" form="client-form" class="btn primary">保存单主</button>`,
      'narrow',
    );
  }
  function showOrderDetail(id) {
    const o = data.orders.find((o) => o.id === id);
    if (!o) return;
    const c = client(o.client);
    modal = { type: 'order-detail', id };
    showModal(
      '稿件详情',
      `<div class="detail-grid"><div class="detail-art">${o.images.length ? `<img src="${e(o.images[0])}" alt="${e(o.title)}"><div class="upload-previews">${o.images.map((img, i) => `<button class="thumb" data-action="detail-image" data-index="${i}" data-id="${id}"><img src="${e(img)}" alt="参考图${i + 1}"></button>`).join('')}</div>` : '<div class="empty panel">还没有参考图</div>'}<div class="divider"></div><div class="progress-label"><span>制作进度</span><span>${e(o.status)}</span></div>${stagesHTML(o)}</div><div><div class="platform-tag" style="--platform:${platform(o.platform).color}"><i class="dot"></i>${e(platform(o.platform).name)}</div><h2 style="font-size:22px;margin:9px 0 18px">${e(o.title)}</h2><dl class="detail-kv"><dt>单主</dt><dd><button class="inline-client" data-action="client-detail" data-id="${o.client}">${e(c.name)} ${icon('chevron')}</button></dd><dt>稿件类别</dt><dd>${e(o.category)}</dd><dt>开始 / 截稿</dt><dd>${shortDate(o.start)} — ${shortDate(o.due)}</dd><dt>定金 / 尾款</dt><dd>${money(o.deposit)} / ${money(o.balance)} ${o.paid ? '<span class="badge">已结清</span>' : ''}</dd>${o.extras.length ? `<dt>额外服务</dt><dd>${o.extras.map((x) => `${e(x.name)} ${money(x.amount)}`).join('<br>')}</dd>` : ''}<dt>金额总计</dt><dd>${money(gross(o))} · 平台费 ${o.fee}%<br>预计净收入 ${money(net(o))}</dd><dt>稿件要求</dt><dd>${e(o.requirements || '未填写')}</dd><dt>单主偏好</dt><dd>${e(c.preferences || '未填写')}</dd><dt>单主雷点</dt><dd>${e(c.dislikes || '未填写')}</dd><dt>单主要求</dt><dd>${e(c.requirements || '未填写')}</dd><dt>稿件备注</dt><dd>${e(o.notes || '未填写')}</dd><dt>单主备注</dt><dd>${e(c.notes || '未填写')}</dd></dl></div></div>`,
      btn('做一张小票', 'order-receipt', 'pink left', `data-id="${id}"`) +
        btn('设为当前稿件', 'set-current', 'green', `data-id="${id}"`) +
        btn(icon('edit') + '编辑稿件', 'edit-order', 'primary', `data-id="${id}"`),
      'wide',
    );
  }
  function clientHistoryHTML(id, query = '') {
    const needle = query.trim().toLowerCase();
    const orders = data.orders
      .filter((o) => o.client === id)
      .filter((o) =>
        [o.title, o.category, o.status, o.due, platform(o.platform).name]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) => b.due.localeCompare(a.due));
    return (
      `<p class="hint">找到 ${orders.length} 份稿件</p>` +
      orders
        .map(
          (o) =>
            `<button class="detail-link" data-action="order-detail" data-id="${o.id}" style="--platform:${platform(o.platform).color}"><span>${e(o.title)}<br><small class="muted">${shortDate(o.due)} · ${e(o.category)} · ${e(platform(o.platform).name)}</small></span><span class="badge">${e(o.status)}</span></button>`,
        )
        .join('') +
      (orders.length ? '' : '<p class="hint">没有符合条件的历史稿件。</p>')
    );
  }
  function showClientDetail(id) {
    const c =
      data.clients.find((c) => c.id === id) || data.archivedClients.find((c) => c.id === id);
    if (!c) return;
    const orders = data.orders.filter((o) => o.client === id),
      count = orders.filter((o) => o.status !== '退单').length;
    modal = { type: 'client-detail', id };
    showModal(
      e(c.name) + '的档案',
      `<div class="color-strip" style="height:7px;border-radius:5px;background:${clientGradient(c)};margin-bottom:20px"></div><div class="row" style="margin-bottom:20px">${c.platforms.map((id) => `<span class="platform-tag" style="--platform:${platform(id).color}"><i class="dot"></i>${e(platform(id).name)}</span>`).join('')}</div><dl class="detail-kv">${[
        ['cn', 'CN'],
        ['salutation', '称呼'],
        ['preferences', '偏好'],
        ['dislikes', '雷点'],
        ['requirements', '要求'],
        ['notes', '备注'],
      ]
        .map(([key, label]) => `<dt>${label}</dt><dd>${e(c[key] || '未填写')}</dd>`)
        .join(
          '',
        )}<dt>平台链接</dt><dd>${c.platformLink ? `<a href="${e(c.platformLink)}" target="_blank" rel="noopener noreferrer">${e(c.platformLink)}</a>` : '未填写'}</dd><dt>合作次数</dt><dd>${count} 次（不含退单） · 已完成 ${orders.filter((o) => o.status === '完成').length} 次</dd></dl><div class="divider"></div><h3 style="font-size:12px">历史稿件 · ${orders.length} 份</h3><label class="searchbox" style="margin:14px 0">${icon('search')}<input id="client-history-search" placeholder="搜索稿件名称、类别、平台、状态或日期" aria-label="搜索历史稿件"></label><div id="client-history-list" class="detail-link-list">${clientHistoryHTML(id)}</div>`,
      btn('新建关联稿件', 'client-new-order', 'green left', `data-id="${id}"`) +
        btn('删除单主', 'delete-client', 'danger', `data-id="${id}"`) +
        btn('编辑档案', 'edit-client', 'primary', `data-id="${id}"`),
      'narrow',
    );
  }
  function showPlatforms() {
    modal = { type: 'platform-manager' };
    showModal(
      '平台管理',
      `<p class="settings-note">修改标识灰度后，稿件、日历、模板与单主色条会一起更新。费率是新建稿件的默认值，已有稿件保留原费率。</p><form id="platform-form">${data.platforms.map((p) => `<div class="platform-manager-row" data-id="${p.id}"><input name="color" type="color" value="${p.color}" aria-label="${e(p.name)}标识灰度"><input name="name" class="platform-name" value="${e(p.name)}" maxlength="24" required aria-label="平台名称"><input name="fee" type="number" value="${p.fee}" min="0" max="100" step="0.01" aria-label="平台费率"><span class="small muted">%</span>${iconBtn('trash', 'delete-platform', '删除平台', `data-id="${p.id}"`)}</div>`).join('')}</form><div class="divider"></div><div class="section-label">新建平台</div><div class="form-grid"><label class="field"><span>名称</span><input id="new-platform-name" maxlength="24"></label><label class="field"><span>标识灰度</span><input id="new-platform-color" type="color" value="#cdcdcd"></label><label class="field"><span>默认费率 / %</span><input id="new-platform-fee" type="number" min="0" max="100" value="0"></label><div class="row" style="align-items:end">${btn('添加平台', 'save-inline-platform', 'small green')}</div></div>`,
      btn('关闭', 'close-modal') +
        `<button type="submit" form="platform-form" class="btn primary">保存修改</button>`,
      'narrow',
    );
  }
  function showSettings() {
    modal = { type: 'settings' };
    showModal(
      '工作台设置',
      `<form id="settings-form"><label class="field"><span>工作室名称</span><input name="name" required maxlength="12" value="${e(data.profile.name)}"></label><label class="field"><span>画师昵称</span><input name="artist" required maxlength="20" value="${e(data.profile.artist)}"></label><label class="field"><span>工作室备注</span><input name="tagline" maxlength="60" value="${e(data.profile.tagline)}"></label></form><div class="divider"></div><h3 style="font-size:12px">数据管理</h3><p class="settings-note" style="margin-top:9px">记录保存在本地电脑的 SQLite 数据库，图片单独保存。关闭浏览器或更新程序不会清空数据。数据库：${e(localInfo.databasePath)}<br>图片与附件：${e(localInfo.filesPath)}。</p><div class="settings-actions">${btn(icon('download') + '导出全部备份', 'backup-export')}${btn(icon('upload') + '导入备份', 'backup-import')}${btn('合并稿件备份', 'merge-backup')}${btn('备份数据库与图片', 'backup-local')}${btn('导入此浏览器旧记录', 'import-browser')}${btn('清空全部记录', 'clear-data', 'danger')}</div><p class="settings-note">备份包含稿件、单主、平台、模板和素材。导入将替换当前工作台，请先保存好原来的备份。</p>`,
      `<button type="submit" form="settings-form" class="btn primary">保存设置</button>`,
      'narrow',
    );
  }
  async function importBrowserRecords() {
    const candidate = await storage.legacy();
    if (!candidate) {
      toast('当前网址未找到旧电脑端记录。请在原 HTML 页面导出全部备份，再在这里导入。');
      return;
    }
    confirmImport(candidate);
  }
  function navigate(next) {
    toolDirty = false;
    page = next;
    tool = '';
    selected.clear();
    search = '';
    platformFilter = '';
    statusFilter = '';
    location.hash = next;
    render();
    window.scrollTo(0, 0);
    setTimeout(refreshRemote, 0);
  }
  function applyTemplate(t) {
    const keep = {
      id: draft.id,
      client: draft.client,
      start: draft.start,
      due: draft.due,
      notes: draft.notes,
      created: draft.created,
    };
    Object.assign(draft, clone(t), keep, { status: '未开始', paid: false });
    delete draft.duration;
  }
  function cancelClient() {
    const prev = modal.previous;
    if (prev) {
      draft = prev.draft;
      modal = prev.modal;
      renderOrderEditor();
    } else closeModal();
  }
  function archiveClients(ids) {
    data.archivedClients ||= [];
    data.clients
      .filter((c) => ids.has(c.id) && data.orders.some((o) => o.client === c.id))
      .forEach((c) => {
        data.archivedClients = data.archivedClients.filter((old) => old.id !== c.id);
        data.archivedClients.push(c);
      });
    data.clients = data.clients.filter((c) => !ids.has(c.id));
  }
  async function deleteEntities(type, ids) {
    if (type === 'clients') archiveClients(ids);
    else data[type] = data[type].filter((o) => !ids.has(o.id));
    selected.clear();
    if (ids.has(data.current))
      data.current =
        data.orders.find((o) => !['完成', '退单'].includes(o.status))?.id ||
        data.orders[0]?.id ||
        '';
    if (!(await persist())) return;
    closeModal();
    render();
    toast('已删除，相关列表与日历已更新。');
  }
  async function handleAction(action, el) {
    const id = el.dataset.id;
    switch (action) {
      case 'nav':
        navigate(el.dataset.page);
        break;
      case 'new-order':
        openOrderEditor();
        break;
      case 'edit-order':
        openOrderEditor(id);
        break;
      case 'new-template':
        openOrderEditor(null, true);
        break;
      case 'edit-template':
        openOrderEditor(id, true);
        break;
      case 'new-client':
        openClientEditor();
        break;
      case 'edit-client':
        openClientEditor(id);
        break;
      case 'client-detail':
        showClientDetail(id);
        break;
      case 'order-detail':
        showOrderDetail(id);
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'cancel-client':
        cancelClient();
        break;
      case 'confirm-action': {
        const cb = modal.callback;
        el.disabled = true;
        await cb();
        if (el.isConnected) el.disabled = false;
        break;
      }
      case 'add-custom-stage': {
        captureDraft();
        const name = $('#custom-stage-name').value.trim();
        if (!name || name.length > 40 || [...draft.stages, '退单'].includes(name)) {
          toast('请输入不重复的流程名称');
          return;
        }
        if (draft.stages.length >= 30) {
          toast('流程最多 30 个节点');
          return;
        }
        draft.stages.splice(-2, 0, name);
        renderOrderEditor();
        break;
      }
      case 'new-tool-template':
        toolDirty = false;
        toolConfig = {
          kind: tool,
          name: '',
          brand: '',
          handle: '',
          message: '',
          subtitle: '',
          accent: '#ffffff',
          image: '',
          customer: '',
          membership: '',
          cardNumber: '',
          order: '',
          design: createDesign(tool),
        };
        render();
        break;
      case 'new-layout-template':
        toolDirty = false;
        layout = createDesign('layout');
        layoutTemplateId = '';
        layoutTemplateName = '';
        render();
        break;
      case 'settings':
        showSettings();
        break;
      case 'platform-manager':
        showPlatforms();
        break;
      case 'week-prev':
        weekOffset--;
        render();
        break;
      case 'week-next':
        weekOffset++;
        render();
        break;
      case 'week-today':
        weekOffset = 0;
        render();
        break;
      case 'month-prev':
        monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
        render();
        break;
      case 'month-next':
        monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
        render();
        break;
      case 'month-today':
        monthDate = new Date(now().getFullYear(), now().getMonth(), 1);
        render();
        break;
      case 'set-stage': {
        const o = data.orders.find((o) => o.id === id);
        if (!o) return;
        o.status = el.dataset.stage;
        if (!(await persist())) return;
        render();
        if (modal?.type === 'order-detail') showOrderDetail(id);
        toast('进度已更新为「' + o.status + '」');
        break;
      }
      case 'set-current':
        data.current = id;
        if (!(await persist())) return;
        closeModal();
        navigate('home');
        toast('已切换当前稿件');
        break;
      case 'choose-current': {
        modal = { type: 'choose-current' };
        showModal(
          '选择当前稿件',
          `<div class="detail-link-list">${
            data.orders
              .filter((o) => !['完成', '退单'].includes(o.status))
              .map(
                (o) =>
                  `<button class="detail-link" data-action="set-current" data-id="${o.id}" style="--platform:${platform(o.platform).color}"><span>${e(o.title)}<br><small class="muted">${e(client(o.client).name)} · ${shortDate(o.due)}截稿</small></span><span class="badge">${e(o.status)}</span></button>`,
              )
              .join('') || '<p class="empty">暂无进行中的稿件。</p>'
          }</div>`,
          '',
          'narrow',
        );
        break;
      }
      case 'lightbox': {
        const o = data.orders.find((o) => o.id === id);
        modal = { type: 'lightbox' };
        showModal(
          e(o.title),
          `<div class="lightbox"><img src="${e(o.images[Number(el.dataset.index) || 0])}" alt="设定图片原图"></div>`,
          '',
          'wide',
        );
        break;
      }
      case 'switch-image': {
        $('.art-frame>img').src = data.orders.find((o) => o.id === id).images[
          Number(el.dataset.index)
        ];
        $('.art-frame>img').dataset.index = el.dataset.index;
        $$('.thumbs .thumb').forEach((b) => b.classList.toggle('active', b === el));
        break;
      }
      case 'detail-image':
        $('.detail-art>img').src = data.orders.find((o) => o.id === id).images[
          Number(el.dataset.index)
        ];
        break;
      case 'add-order-image':
        pickFiles(async (files) => {
          const imgs = await readImages(files);
          const o = data.orders.find((o) => o.id === id);
          o.images.push(...imgs.slice(0, 12 - o.images.length).map((x) => x.src));
          if (!(await persist())) return;
          render();
          toast('参考图片已添加');
        }, true);
        break;
      case 'upload-draft':
        captureDraft();
        pickFiles(uploadDraft, true);
        break;
      case 'remove-draft-image':
        captureDraft();
        draft.images.splice(Number(el.dataset.index), 1);
        renderOrderEditor();
        break;
      case 'add-service':
        captureDraft();
        draft.extras.push({ name: '', amount: 0 });
        renderOrderEditor();
        break;
      case 'remove-service':
        captureDraft();
        draft.extras.splice(Number(el.dataset.index), 1);
        renderOrderEditor();
        break;
      case 'inline-platform':
        $('#inline-platform-form').classList.toggle('hidden');
        $('#new-platform-name')?.focus();
        break;
      case 'save-inline-platform': {
        const name = $('#new-platform-name').value.trim(),
          color = grayColor($('#new-platform-color').value),
          fee = Number($('#new-platform-fee').value);
        if (!name) {
          toast('请输入平台名称');
          return;
        }
        if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
          toast('费率需要在 0–100% 之间');
          return;
        }
        if (data.platforms.some((p) => p.name === name)) {
          toast('这个平台已存在，直接选择即可');
          return;
        }
        const p = { id: uid(), name, color, fee };
        if (modal.type.includes('order') || modal.type === 'template-editor') {
          captureDraft();
          data.platforms.push(p);
          draft.platform = p.id;
          draft.client = '';
          draft.fee = fee;
          if (!(await persist())) return;
          renderOrderEditor();
        } else if (modal.type === 'client-editor') {
          captureClientDraft();
          data.platforms.push(p);
          draft.platforms.push(p.id);
          if (!(await persist())) return;
          renderClientEditor();
        } else {
          data.platforms.push(p);
          if (!(await persist())) return;
          render();
          showPlatforms();
        }
        toast('平台已添加');
        break;
      }
      case 'delete-platform': {
        if (
          data.orders.some((o) => o.platform === id) ||
          data.templates.some((o) => o.platform === id) ||
          [...data.clients, ...(data.archivedClients || [])].some((c) => c.platforms.includes(id))
        ) {
          toast('这个平台仍有关联资料，请先修改这些资料的平台。');
          return;
        }
        data.platforms = data.platforms.filter((p) => p.id !== id);
        if (!(await persist())) return;
        render();
        showPlatforms();
        break;
      }
      case 'quick-client':
        captureDraft();
        if (!draft.platform) {
          toast('请先选择平台');
          return;
        }
        openClientEditor(null, true);
        break;
      case 'use-template': {
        const t = data.templates.find((t) => t.id === id);
        openOrderEditor();
        draft.platform = t.platform;
        applyTemplate(t);
        renderOrderEditor();
        break;
      }
      case 'client-new-order': {
        const c = client(id);
        if (!data.clients.some((item) => item.id === id)) {
          data.clients.push(clone(c));
          data.archivedClients = (data.archivedClients || []).filter((item) => item.id !== id);
          if (!(await persist())) return;
        }
        openOrderEditor();
        draft.client = id;
        draft.platform = c.platforms[0] || data.platforms[0]?.id || '';
        draft.fee = platform(draft.platform).fee;
        renderOrderEditor();
        break;
      }
      case 'delete-draft': {
        const type = modal.type === 'template-editor' ? 'templates' : 'orders',
          oid = draft.id;
        confirmAction(
          '删除这份' + (type === 'orders' ? '稿件' : '模板') + '？',
          '删除后将从列表中移除。' +
            (type === 'orders' ? '关联日历与统计会同步更新。' : '已使用此模板建立的稿件会保留。'),
          () => deleteEntities(type, new Set([oid])),
        );
        break;
      }
      case 'delete-client':
        confirmAction('删除这位单主？', '将移除单主档案。已有稿件中的历史单主信息会保留。', () =>
          deleteEntities('clients', new Set([id])),
        );
        break;
      case 'select-all':
      case 'select-all-check': {
        const items = filtered(data[el.dataset.type]);
        const all = items.every((x) => selected.has(x.id));
        items.forEach((x) => (all ? selected.delete(x.id) : selected.add(x.id)));
        render();
        break;
      }
      case 'deselect-all':
        selected.clear();
        render();
        break;
      case 'delete-selected': {
        const ids = new Set(selected),
          type = el.dataset.type;
        confirmAction(
          `删除选中的 ${ids.size} 项？`,
          type === 'clients'
            ? '已有稿件中的历史单主信息会保留。'
            : '删除后无法在页面中撤销，请确认已保存需要的资料。',
          () => deleteEntities(type, ids),
        );
        break;
      }
      case 'day-detail': {
        const s = el.dataset.date,
          items = data.orders.filter(
            (o) => o.due === s && (!platformFilter || o.platform === platformFilter),
          );
        modal = { type: 'day', date: s };
        showModal(
          shortDate(s) + '的截稿安排',
          `<div class="detail-link-list">${items.map((o) => `<button class="detail-link" data-action="order-detail" data-id="${o.id}" style="--platform:${platform(o.platform).color}"><span>${e(o.title)} · ${e(client(o.client).name)}</span><span class="badge">${e(o.status)}</span></button>`).join('') || '<p class="empty">当日暂无截稿安排。</p>'}</div>`,
          btn('在这天新增稿件', 'new-order-day', 'green', `data-date="${s}"`),
          'narrow',
        );
        break;
      }
      case 'new-order-day':
        openOrderEditor();
        draft.due = el.dataset.date;
        if (draft.start > draft.due) draft.start = draft.due;
        renderOrderEditor();
        break;
      case 'reminders': {
        const items = data.orders
          .filter(
            (o) => !['完成', '退单'].includes(o.status) && o.due <= dateStr(addDays(now(), 7)),
          )
          .sort((a, b) => a.due.localeCompare(b.due));
        modal = { type: 'reminders' };
        showModal(
          '截稿提醒',
          `<p class="hint">逾期与未来 7 天截稿的稿件</p><div class="detail-link-list">${items.map((o) => `<button class="detail-link" data-action="order-detail" data-id="${o.id}" style="--platform:${platform(o.platform).color}"><span>${e(o.title)}<br><small class="muted">${e(client(o.client).name)} · ${shortDate(o.due)}</small></span><span class="badge ${o.due < today() ? 'pink' : ''}">${o.due < today() ? '已逾期' : e(o.status)}</span></button>`).join('') || '<p class="empty">未来 7 天暂无截稿安排。</p>'}</div>`,
          '',
          'narrow',
        );
        break;
      }
      case 'open-tool':
        toolDirty = false;
        initTool(el.dataset.tool);
        render();
        window.scrollTo(0, 0);
        break;
      case 'tools-back':
        toolDirty = false;
        tool = '';
        render();
        break;
      case 'order-receipt':
        closeModal();
        navigate('tools');
        initTool('receipt');
        toolConfig.order = id;
        toolConfig.customer = client(data.orders.find((o) => o.id === id).client).name;
        render();
        break;
      case 'upload-assets':
        pickFiles(uploadAssets, true);
        break;
      case 'delete-asset':
        data.assets = data.assets.filter((a) => a.id !== id);
        if (!(await persist())) return;
        render();
        toast('素材已移除，已制作的模板会保留');
        break;
      case 'upload-mark':
        pickFiles(async (files) => setWatermark('mark', (await readImages(files))[0]?.src));
        break;
      case 'upload-base':
        pickFiles(async (files) => setWatermark('image', (await readImages(files))[0]?.src));
        break;
      case 'clear-base':
        watermark.image = null;
        render();
        break;
      case 'clear-mark':
        watermark.mark = null;
        delete data.watermarkMark;
        if (!(await persist())) return;
        render();
        break;
      case 'upload-tool-image':
        pickFiles(async (files) => {
          await addDesignImages(ensureToolDesign(), await readImages(files));
          render();
        });
        break;
      case 'clear-tool-image':
        toolConfig.image = '';
        render();
        break;
      case 'use-asset': {
        const a = data.assets.find((a) => a.id === id);
        if (el.dataset.mode === 'watermark') await setWatermark('mark', a.src);
        else if (el.dataset.mode === 'layout') await addLayoutItems([a]);
        else {
          await addDesignImages(ensureToolDesign(), [a]);
          render();
        }
        break;
      }
      case 'save-tool-template':
      case 'update-tool-template': {
        if (!toolConfig.name.trim()) {
          toast('请输入模板名称');
          return;
        }
        const t = clone(toolConfig);
        t.id = action === 'update-tool-template' && t.id ? t.id : uid();
        delete t.order;
        if (toolConfig.order) delete t.customer;
        const idx = data.toolTemplates.findIndex((x) => x.id === t.id);
        if (idx < 0) data.toolTemplates.push(t);
        else data.toolTemplates[idx] = t;
        toolConfig.id = t.id;
        if (!(await persist())) return;
        toolDirty = false;
        render();
        toast('模板已保存');
        break;
      }
      case 'load-tool-template': {
        toolDirty = false;
        const t = data.toolTemplates.find((t) => t.id === id);
        const keep = {
          order: toolConfig.order,
          ...(toolConfig.order ? { customer: toolConfig.customer } : {}),
        };
        toolConfig = { ...clone(t), ...keep };
        ensureToolDesign();
        render();
        break;
      }
      case 'delete-tool-template': {
        const tid = id || toolConfig?.id;
        confirmAction('删除这个创作模板？', '删除模板不会影响已有稿件或素材。', async () => {
          data.toolTemplates = data.toolTemplates.filter((t) => t.id !== tid);
          if (toolConfig?.id === tid) delete toolConfig.id;
          if (layoutTemplateId === tid) {
            layoutTemplateId = '';
            layoutTemplateName = '';
          }
          if (!(await persist())) return;
          closeModal();
          render();
          toast('模板已删除');
        });
        break;
      }
      case 'upload-layout':
        pickFiles(async (files) => addLayoutItems(await readImages(files)), true);
        break;
      case 'layout-front':
        if (layout.selected >= 0) {
          const item = layout.items.splice(layout.selected, 1)[0];
          layout.items.push(item);
          layout.selected = layout.items.length - 1;
          render();
        }
        break;
      case 'layout-back':
        if (layout.selected >= 0) {
          const item = layout.items.splice(layout.selected, 1)[0];
          layout.items.unshift(item);
          layout.selected = 0;
          render();
        }
        break;
      case 'layout-remove':
        if (layout.selected >= 0) {
          layout.items.splice(layout.selected, 1);
          layout.selected = -1;
          render();
        }
        break;
      case 'save-layout-template':
      case 'update-layout-template': {
        const name = $('#layout-template-name').value.trim();
        if (!name) {
          toast('请输入排版模板名称');
          return;
        }
        const templateId =
          action === 'update-layout-template' && layoutTemplateId ? layoutTemplateId : uid();
        const template = { id: templateId, kind: 'layout', name, layout: clone(layout) };
        const existing = data.toolTemplates.findIndex((t) => t.id === templateId);
        if (existing < 0) data.toolTemplates.push(template);
        else data.toolTemplates[existing] = template;
        if (!(await persist())) return;
        layoutTemplateId = templateId;
        layoutTemplateName = name;
        toolDirty = false;
        render();
        toast('排版模板已保存');
        break;
      }
      case 'load-layout-template': {
        toolDirty = false;
        const t = data.toolTemplates.find((t) => t.id === id);
        layout = prepareDesign(t.layout);
        layout.selected = -1;
        layoutTemplateId = t.id;
        layoutTemplateName = t.name;
        render();
        break;
      }
      case 'copy-output':
        await copyOutput();
        break;
      case 'export-png':
      case 'export-jpg':
      case 'export-pdf':
        await exportOutput(action.slice(7));
        break;
      case 'backup-export':
        download(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
          `接稿工作台-备份-${today()}.json`,
        );
        toast('备份已导出，包含所有图片与素材');
        break;
      case 'backup-import':
        pickFiles(importBackup, false, '.json');
        break;
      case 'merge-backup':
        pickFiles((files) => importBackup(files, true), false, '.json');
        break;
      case 'backup-local': {
        await saveQueue;
        if (failedSave) throw new Error('当前修改未保存，请先导出 JSON 备份。');
        const destination = await storage.backup();
        toast('数据库与图片已备份：' + destination);
        break;
      }
      case 'import-browser':
        await importBrowserRecords();
        break;
      case 'clear-data':
        confirmAction(
          '清空工作台记录？',
          '将清空稿件、单主、模板、素材与水印。平台和工作室设置会保留。建议先导出备份。',
          async () => {
            data.orders = [];
            data.clients = [];
            data.archivedClients = [];
            data.templates = [];
            data.assets = [];
            data.toolTemplates = [];
            data.current = '';
            delete data.watermarkMark;
            watermark.mark = null;
            watermark.image = null;
            layout.items = [];
            if (!(await persist())) return;
            closeModal();
            render();
            toast('工作台记录已清空');
          },
        );
        break;
      case 'reset-data':
        confirmAction('重置为空白？', '当前记录将清空，请先导出需要保留的资料。', async () => {
          data = initialData();
          watermark.mark = null;
          watermark.image = null;
          if (!(await persist())) return;
          closeModal();
          render();
          toast('已重置为空白工作台');
        });
        break;
    }
  }
  document.addEventListener('click', (event) => {
    const checkbox = event.target.closest('.entity-select');
    if (checkbox) {
      selected.has(checkbox.dataset.id)
        ? selected.delete(checkbox.dataset.id)
        : selected.add(checkbox.dataset.id);
      render();
      return;
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    event.preventDefault();
    if (pendingSaves && el.dataset.action !== 'backup-export') {
      toast('正在等待电脑保存，请稍后再操作。');
      return;
    }
    interactionBusy++;
    handleAction(el.dataset.action, el)
      .catch((err) => {
        console.error(err);
        toast('操作没有完成：' + err.message);
      })
      .finally(() => {
        interactionBusy--;
      });
  });
  function captureClientDraft() {
    const fd = new FormData($('#client-form'));
    [
      'name',
      'cn',
      'salutation',
      'platformLink',
      'preferences',
      'dislikes',
      'requirements',
      'notes',
    ].forEach((k) => (draft[k] = String(fd.get(k) || '').trim()));
    draft.platforms = fd.getAll('platforms');
  }
  async function saveSubmittedForm(form) {
    const submit = $(`button[form="${form.id}"]`);
    if (submit) submit.disabled = true;
    const saved = await persist();
    if (submit?.isConnected) submit.disabled = false;
    return saved;
  }
  document.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'order-form') {
      if (!form.reportValidity()) return;
      captureDraft();
      if (!draft.title || !draft.category) {
        toast('名称与类别不能只有空格');
        return;
      }
      const isTemplate = modal.type === 'template-editor';
      if (!isTemplate) {
        draft.start = draft.start || today();
        if (draft.start > draft.due) {
          toast('截稿日期不能早于开始日期');
          return;
        }
        if (
          !data.clients.some((c) => c.id === draft.client && c.platforms.includes(draft.platform))
        ) {
          toast('请选择当前平台的单主');
          return;
        }
      }
      const arr = isTemplate ? data.templates : data.orders,
        idx = arr.findIndex((o) => o.id === draft.id);
      if (idx >= 0) arr[idx] = clone(draft);
      else arr.push(clone(draft));
      if (!isTemplate && !data.current) data.current = draft.id;
      if (!(await saveSubmittedForm(form))) return;
      closeModal();
      render();
      toast(isTemplate ? '模板已保存' : '稿件已保存，日历与单主档案已同步');
    } else if (form.id === 'client-form') {
      if (!form.reportValidity()) return;
      captureClientDraft();
      if (!draft.name) {
        toast('单主名称不能为空');
        return;
      }
      if (!draft.platforms.length) {
        toast('请至少选择一个平台');
        return;
      }
      if (draft.platformLink && !/^https?:\/\/[^\s]+$/i.test(draft.platformLink)) {
        toast('平台链接请使用 http:// 或 https:// 地址');
        return;
      }
      const prev = modal.previous,
        newClient = clone(draft),
        idx = data.clients.findIndex((c) => c.id === newClient.id);
      if (idx < 0) data.clients.push(newClient);
      else data.clients[idx] = newClient;
      data.archivedClients = (data.archivedClients || []).filter((c) => c.id !== newClient.id);
      if (!(await saveSubmittedForm(form))) return;
      render();
      if (prev) {
        draft = prev.draft;
        modal = prev.modal;
        draft.client = newClient.platforms.includes(draft.platform) ? newClient.id : '';
        renderOrderEditor();
      } else closeModal();
      toast('单主档案已保存');
    } else if (form.id === 'platform-form') {
      if (!form.reportValidity()) return;
      const rows = $$('.platform-manager-row', form);
      const names = rows.map((r) => $('[name=name]', r).value.trim());
      if (names.some((n) => !n) || new Set(names).size !== names.length) {
        toast('平台名称不能为空或重复');
        return;
      }
      rows.forEach((r) => {
        const p = data.platforms.find((p) => p.id === r.dataset.id);
        p.name = $('[name=name]', r).value.trim();
        p.color = grayColor($('[name=color]', r).value);
        p.fee = Number($('[name=fee]', r).value);
      });
      if (!(await saveSubmittedForm(form))) return;
      closeModal();
      render();
      toast('平台设置已同步');
    } else if (form.id === 'settings-form') {
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const name = fd.get('name').trim(),
        artist = fd.get('artist').trim();
      if (!name || !artist) {
        toast('名称不能为空');
        return;
      }
      data.profile = { name, artist, tagline: fd.get('tagline').trim() };
      if (!(await saveSubmittedForm(form))) return;
      closeModal();
      render();
      toast('工作台设置已更新');
    }
  });
  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'platform-filter') {
      platformFilter = el.value;
      selected.clear();
      render();
    }
    if (el.id === 'status-filter') {
      statusFilter = el.value;
      selected.clear();
      render();
    }
    if (el.name === 'platform' && $('#order-form')) {
      captureDraft();
      draft.client = '';
      draft.fee = platform(draft.platform).fee;
      renderOrderEditor();
    }
    if (el.id === 'category-choice' && el.value) $('[name=category]').value = el.value;
    if (el.id === 'order-template' && el.value) {
      captureDraft();
      applyTemplate(data.templates.find((t) => t.id === el.value));
      renderOrderEditor();
      toast('模板已带入，每一项都可以继续修改');
    }
    if (el.name === 'optional-stage') {
      captureDraft();
      const sel = $('[name=status]');
      if (sel)
        sel.innerHTML = allStages(draft)
          .map((s) => `<option ${s === draft.status ? 'selected' : ''}>${e(s)}</option>`)
          .join('');
    }
    if (el.id === 'tool-order') {
      toolConfig.order = el.value;
      const o = data.orders.find((o) => o.id === el.value);
      toolConfig.customer = o ? client(o.client).name : '';
      render();
    }
    if (el.id === 'wm-position') {
      watermark.position = el.value;
      drawCurrentTool();
    }
    if (el.id === 'layout-width' || el.id === 'layout-height') {
      const val = Math.round(Number(el.value));
      if (val < 200 || val > 4000 || !Number.isFinite(val)) {
        toast('画布尺寸需要在 200–4000 px 之间');
        el.value = layout[el.id.slice(7)];
        return;
      }
      layout[el.id.slice(7)] = val;
      drawCurrentTool();
    }
  });
  let searchTimer;
  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.name === 'category' && $('#category-choice'))
      $('#category-choice').value = el.value.trim();
    if (el.id === 'client-history-search' && modal?.type === 'client-detail')
      $('#client-history-list').innerHTML = clientHistoryHTML(modal.id, el.value);
    if (el.id === 'layout-template-name') layoutTemplateName = el.value;
    if (el.id === 'list-search') {
      clearTimeout(searchTimer);
      search = el.value;
      const caret = el.selectionStart;
      searchTimer = setTimeout(() => {
        render();
        const input = $('#list-search');
        input?.focus();
        input?.setSelectionRange(caret, caret);
      }, 150);
    }
    if (
      el.closest('#order-form') &&
      (el.name === 'deposit' ||
        el.name === 'balance' ||
        el.name === 'fee' ||
        el.classList.contains('service-amount'))
    ) {
      captureDraft();
      $('#gross-preview').textContent = money(gross(draft));
      $('#net-preview').textContent = money(net(draft));
    }
    if (el.dataset.toolField) {
      toolConfig[el.dataset.toolField] = el.value;
      drawCurrentTool();
    }
    if (el.id === 'wm-opacity' || el.id === 'wm-size') {
      const key = el.id === 'wm-opacity' ? 'opacity' : 'size';
      watermark[key] = Number(el.value) / (key === 'opacity' ? 100 : 1);
      $('#' + el.id + '-value').textContent = el.value + '%';
      drawCurrentTool();
    }
    if (el.id === 'layout-bg') {
      layout.bg = grayColor(el.value);
      el.value = layout.bg;
      drawCurrentTool();
    }
    if (el.id === 'layout-scale' || el.id === 'layout-rotation') {
      const s = layout.items[layout.selected];
      if (s) {
        s[el.id.slice(7)] = Number(el.value);
        $('#' + el.id + '-value').textContent = el.value + (el.id === 'layout-scale' ? '%' : '°');
        drawCurrentTool();
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (modal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        modal.type === 'client-editor' && modal.previous ? cancelClient() : closeModal();
      }
      if (event.key === 'Tab') {
        const f = $$(
          'button:not([disabled]),input:not([type=hidden]):not([disabled]),select,textarea,[tabindex="0"]',
          $('#modal-root'),
        ).filter((x) => x.getClientRects().length);
        if (
          f.length &&
          ((event.shiftKey && document.activeElement === f[0]) ||
            (!event.shiftKey && document.activeElement === f.at(-1)))
        ) {
          event.preventDefault();
          (event.shiftKey ? f.at(-1) : f[0]).focus();
        }
      }
      return;
    }
    if (tool === 'layout' && document.activeElement?.id === 'output-canvas') {
      const item = layout.items[layout.selected];
      if (!item) return;
      const amount = event.shiftKey ? 10 : 1;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        layout.items.splice(layout.selected, 1);
        layout.selected = -1;
        render();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'ArrowUp') item.y -= amount;
        if (event.key === 'ArrowDown') item.y += amount;
        if (event.key === 'ArrowLeft') item.x -= amount;
        if (event.key === 'ArrowRight') item.x += amount;
        drawCurrentTool();
      }
    }
  });
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (pageNames[next] && page !== next) navigate(next);
  });
  function pickFiles(
    callback,
    multiple = false,
    accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp',
  ) {
    const input = $('#global-file');
    input.value = '';
    input.multiple = multiple;
    input.accept = accept;
    input.onchange = () => {
      if (input.files.length) {
        const files = [...input.files];
        interactionBusy++;
        Promise.resolve()
          .then(() => callback(files))
          .catch((err) => toast(err.message))
          .finally(() => {
            interactionBusy--;
          });
      }
    };
    input.click();
  }
  async function readImages(files) {
    const out = [];
    for (const file of [...files].slice(0, 20)) {
      if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) {
        toast('图片支持 PNG、JPG、WebP、GIF 与 BMP，透明水印请用 PNG。');
        continue;
      }
      if (file.size > 12 * 1024 * 1024) {
        toast('单张图片请小于 12 MB：' + file.name);
        continue;
      }
      const src = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('图片读取失败'));
        r.readAsDataURL(file);
      });
      await loadImage(src);
      out.push({ id: uid(), name: file.name, src });
    }
    return out;
  }
  async function uploadDraft(files) {
    const activeDraft = draft;
    const save = $('#save-order-btn');
    if (save) save.disabled = true;
    try {
      const imgs = await readImages(files);
      if (draft !== activeDraft) return;
      captureDraft();
      draft.images.push(...imgs.slice(0, 12 - draft.images.length).map((x) => x.src));
      renderOrderEditor();
    } finally {
      if ($('#save-order-btn')) $('#save-order-btn').disabled = false;
    }
  }
  async function uploadAssets(files) {
    const imgs = await readImages(files);
    data.assets.push(...imgs);
    if (!(await persist())) return;
    render();
    toast(`已保存 ${imgs.length} 张素材，可在组件里重复使用`);
  }
  async function setWatermark(key, src) {
    if (!src) return;
    watermark[key] = src;
    if (key === 'mark') {
      data.watermarkMark = src;
      if (!(await persist())) return;
    }
    render();
  }
  document.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-drop],.art-region');
    if (zone) {
      event.preventDefault();
      zone.classList.add('dragover');
    }
  });
  document.addEventListener('dragleave', (event) =>
    event.target.closest('[data-drop]')?.classList.remove('dragover'),
  );
  document.addEventListener('drop', async (event) => {
    const zone = event.target.closest('[data-drop],.art-region');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('dragover');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    interactionBusy++;
    try {
      const kind = zone.dataset.drop;
      if (kind === 'draft') {
        captureDraft();
        await uploadDraft(files);
      } else if (kind === 'assets') await uploadAssets(files);
      else if (kind === 'layout') await addLayoutItems(await readImages(files));
      else if (kind === 'tool-image') {
        await addDesignImages(ensureToolDesign(), await readImages(files));
        render();
      } else if (kind === 'watermark-mark' || kind === 'watermark-image')
        await setWatermark(
          kind.endsWith('mark') ? 'mark' : 'image',
          (await readImages(files))[0]?.src,
        );
      else {
        const o = data.orders.find((o) => o.id === data.current);
        if (o) {
          o.images.push(
            ...(await readImages(files)).slice(0, 12 - o.images.length).map((a) => a.src),
          );
          if (!(await persist())) return;
          render();
        }
      }
    } catch (err) {
      toast(err.message);
    } finally {
      interactionBusy--;
    }
  });
  const imageCache = new Map();
  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error('这张图片无法读取，请换一张 PNG 或 JPG 图片。'));
      };
      img.src = src;
    });
    imageCache.set(src, promise);
    return promise;
  }
  function rounded(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function text(
    ctx,
    value,
    x,
    y,
    size = 20,
    color = '#414141',
    align = 'left',
    font = 'sans-serif',
  ) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font === 'serif' ? 'Georgia,serif' : '"Microsoft YaHei","PingFang SC",sans-serif'}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(value), x, y);
  }
  function wrapped(
    ctx,
    value,
    x,
    y,
    maxWidth,
    lineHeight = 31,
    size = 20,
    color = '#858585',
    align = 'left',
  ) {
    ctx.font = `${size}px "Microsoft YaHei","PingFang SC",sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    let line = '';
    for (const ch of String(value)) {
      if (ch === '\n' || (line && ctx.measureText(line + ch).width > maxWidth)) {
        ctx.fillText(line, x, y);
        line = ch === '\n' ? '' : ch;
        y += lineHeight;
      } else line += ch;
    }
    if (line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }
  function drawCover(ctx, img, x, y, w, h, contain = false) {
    const ratio = contain
      ? Math.min(w / img.naturalWidth, h / img.naturalHeight)
      : Math.max(w / img.naturalWidth, h / img.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(
      img,
      x + (w - img.naturalWidth * ratio) / 2,
      y + (h - img.naturalHeight * ratio) / 2,
      img.naturalWidth * ratio,
      img.naturalHeight * ratio,
    );
    ctx.restore();
  }
  function dashed(ctx, y, width, margin = 40) {
    ctx.beginPath();
    ctx.setLineDash([5, 7]);
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.strokeStyle = '#dfdfdf';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function flower(ctx, x, y, r, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#fdfdfd';
    ctx.fill();
    ctx.restore();
  }
  let drawVersion = 0;
  async function drawCurrentTool(clean = false) {
    const canvas = $('#output-canvas');
    if (!canvas) return;
    const version = ++drawVersion;
    try {
      if (tool !== 'watermark') {
        const state = tool === 'layout' ? layout : ensureToolDesign();
        const resolve = tool === 'layout' ? () => '' : componentValue;
        const bindings = {
          kind: tool,
          redraw: () => drawCurrentTool(),
          render,
          notify: toast,
          changed: markToolDirty,
          upload: (callback, multiple) =>
            pickFiles(async (files) => callback(await readImages(files)), multiple),
        };
        // Bind controls before image decoding yields. A fast first selection
        // must update the template state, not just the visible input value.
        bindDesigner(canvas, state, resolve, undefined, bindings);
        const bounds = await drawDesign(
          canvas,
          state,
          resolve,
          clean,
          () => version === drawVersion,
        );
        if (version !== drawVersion || !canvas.isConnected || !bounds) return;
        bindDesigner(canvas, state, resolve, bounds, bindings);
        return;
      }
      const imgs = await Promise.all([
        watermark.image ? loadImage(watermark.image) : null,
        watermark.mark ? loadImage(watermark.mark) : null,
      ]);
      if (version !== drawVersion || !canvas.isConnected) return;
      drawWatermark(canvas, canvas.getContext('2d'), imgs);
    } catch (err) {
      toast(err.message);
    }
  }
  function drawWatermark(canvas, ctx, [image, mark]) {
    canvas.width = image?.naturalWidth || 800;
    canvas.height = image?.naturalHeight || 650;
    if (!image) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      text(ctx, '暂无合成图片', 400, 345, 24, '#a3a3a3', 'center');
      text(ctx, '请在左侧上传原图和透明水印', 400, 392, 17, '#b7b7b7', 'center');
      return;
    }
    ctx.drawImage(image, 0, 0);
    if (!mark) return;
    const w = (canvas.width * watermark.size) / 100,
      h = (w * mark.naturalHeight) / mark.naturalWidth,
      pad = canvas.width * 0.03;
    ctx.globalAlpha = watermark.opacity;
    if (watermark.position === 'tile') {
      const stepX = w * 1.6,
        stepY = Math.max(h * 1.9, canvas.height * 0.12);
      for (let y = -h; y < canvas.height; y += stepY)
        for (let x = -w; x < canvas.width; x += stepX)
          ctx.drawImage(mark, x + (Math.round(y / stepY) % 2) * w * 0.5, y, w, h);
    } else {
      let x = (canvas.width - w) / 2,
        y = (canvas.height - h) / 2;
      if (watermark.position.includes('right')) x = canvas.width - w - pad;
      if (watermark.position.includes('left')) x = pad;
      if (watermark.position.includes('bottom')) y = canvas.height - h - pad;
      if (watermark.position.includes('top')) y = pad;
      ctx.drawImage(mark, x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }
  async function addLayoutItems(assets) {
    markToolDirty();
    await addDesignImages(layout, assets);
    render();
    toast('素材已放入画布，可拖动调整位置');
  }
  async function getOutputCanvas() {
    if (tool === 'watermark' && (!watermark.image || !watermark.mark)) {
      throw new Error('请先放入原图和水印。');
    }

    await drawCurrentTool(true);
    const canvas = $('#output-canvas');
    if (!canvas) throw new Error('请先打开一个创作组件。');
    return canvas;
  }
  async function copyOutput() {
    if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
      toast('这个浏览器暂不支持复制图片，请使用「保存 PNG」。本地预览地址支持得更好。');
      return;
    }
    try {
      const canvas = await getOutputCanvas();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('生成图片失败');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制到剪贴板');
    } catch (err) {
      toast(
        err.name === 'NotAllowedError'
          ? '浏览器未允许复制图片，请授权剪贴板或使用「保存 PNG」。'
          : err.message,
      );
    } finally {
      if (tool !== 'watermark') drawCurrentTool();
    }
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function exportOutput(format) {
    const canvas = await getOutputCanvas();
    let blob;
    if (format === 'pdf') blob = canvasPDF(canvas);
    else {
      let target = canvas;
      if (format === 'jpg') {
        target = document.createElement('canvas');
        target.width = canvas.width;
        target.height = canvas.height;
        const ctx = target.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.drawImage(canvas, 0, 0);
      }
      blob = await new Promise((resolve) =>
        target.toBlob(resolve, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95),
      );
    }
    if (!blob) throw new Error('生成图片失败，请重试');
    download(blob, `${toolNames[tool]}-${today()}.${format}`);
    if (tool !== 'watermark') drawCurrentTool();
    toast(`${format.toUpperCase()} 已生成`);
  }
  function canvasPDF(canvas) {
    // A single-page PDF containing the rendered artwork; all Chinese text is rasterized faithfully.
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    const jpeg = Uint8Array.from(atob(flat.toDataURL('image/jpeg', 0.95).split(',')[1]), (c) =>
      c.charCodeAt(0),
    );
    const ratio = Math.min(595 / canvas.width, 842 / canvas.height),
      w = Math.round(canvas.width * ratio),
      h = Math.round(canvas.height * ratio);
    const enc = new TextEncoder(),
      parts = [],
      offsets = [0];
    let length = 0;
    const push = (v) => {
      const arr = typeof v === 'string' ? enc.encode(v) : v;
      parts.push(arr);
      length += arr.length;
    };
    const object = (id, body) => {
      offsets[id] = length;
      push(`${id} 0 obj\n${body}\nendobj\n`);
    };
    push('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`,
    );
    offsets[4] = length;
    push(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push('\nendstream\nendobj\n');
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Image Do\nQ\n`;
    object(5, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
    const start = length;
    push('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  async function importBackup(files, merge = false) {
    const file = files[0];
    if (file.size > 128 * 1024 * 1024) throw new Error('备份请小于 128 MB');
    let candidate;
    try {
      candidate = validateBackup(JSON.parse(await file.text()));
    } catch (err) {
      toast(err instanceof SyntaxError ? '这不是有效的 JSON 备份文件' : err.message);
      return;
    }
    confirmImport(candidate, merge);
  }
  function confirmImport(candidate, merge = false) {
    modal = {
      type: 'confirm',
      callback: async () => {
        await saveQueue;
        if (failedSave) throw new Error('当前修改未保存，请先导出备份并刷新。');
        await storage.backup();
        data = merge ? mergeBackup(data, candidate) : candidate;
        migrateAppearance();
        watermark.mark = data.watermarkMark || null;
        watermark.image = null;
        if (!(await persist())) return;
        closeModal();
        render();
        toast(merge ? '稿件记录已合并，电脑已有记录和设置保留。' : '备份已导入，所有关联已恢复');
      },
    };
    showModal(
      merge ? '合并稿件备份？' : '导入并替换工作台？',
      `<p class="settings-note">备份包含 ${candidate.orders.length} 份稿件、${candidate.clients.length} 位单主和 ${candidate.assets.length} 张素材。${merge ? '确认后先备份电脑数据，再用新编号添加副本，保留现有记录与设置。同名平台使用电脑设置，稿件本身费率保留。重复导入会添加重复副本。' : '确认后先备份电脑中的现有数据，再替换电脑端记录。'}原浏览器记录保留。</p>`,
      btn('取消', 'close-modal') + btn('确认导入', 'confirm-action', 'primary'),
      'narrow',
    );
  }
  boot()
    .then(() => {
      watermark.mark = data.watermarkMark || null;
    })
    .catch((err) => {
      $('#app').innerHTML =
        '<div class="loading">工作台读取失败：' +
        e(err.message) +
        '<br>请检查本机服务和日志后重新打开。原数据未被清空。</div>';
      console.error(err);
    });
})();
