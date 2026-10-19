// Desktop-only tools. Records use the same transactional API as commissions.
import { validateBackup } from './model.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const copy = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const money = (value) => '¥' + Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const button = (text, action, attrs = '', kind = 'small') => `<button type="button" class="btn ${kind}" data-extra="${action}" ${attrs}>${text}</button>`;
const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const field = (label, name, value, type = 'text', attrs = '') => `<label class="field"><span>${label}</span><input data-extra-field="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const newEntry = () => ({ id: uid(), name: '', price: 0, description: '', image: '', bg: '#ffffff', color: '#242424', fit: 'cover' });
const newList = () => ({ id: uid(), name: '', width: 1200, columns: 2, cardHeight: 540, gap: 24, padding: 48, bg: '#eeeeee', backgroundImage: '', items: [] });
const loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('图片读取失败，请重新上传。')); img.src = src; });

export class ExtraTools {
  constructor(context) {
    this.context = context;
    this.price = null;
    this.replyFolder = '';
    this.replyDraft = null;
    this.folderDraft = null;
    this.replySearch = '';
    this.replyTemplateFilter = '';
    this.saving = false;
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-extra]');
      if (!target) return;
      event.preventDefault();
      if (!this.saving) this.action(target.dataset.extra, target).catch((error) => this.context.toast(error.message));
    });
    document.addEventListener('input', (event) => this.input(event.target));
    document.addEventListener('change', (event) => this.change(event.target));
    document.addEventListener('dragstart', (event) => {
      const item = event.target.closest('[data-price-drag]');
      if (item) { event.dataTransfer.setData('application/x-lotus-price', JSON.stringify({ kind: item.dataset.priceDrag, id: item.dataset.id })); event.dataTransfer.effectAllowed = 'copyMove'; }
    });
    document.addEventListener('dragover', (event) => {
      if (event.target.closest('[data-price-drop]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
    });
    document.addEventListener('drop', (event) => {
      const zone = event.target.closest('[data-price-drop]');
      if (!zone || !this.price) return;
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/x-lotus-price');
      if (!raw) return;
      try {
        const item = JSON.parse(raw), target = event.target.closest('[data-price-drag="item"]');
        this.insertEntry(item.kind, item.id, target?.dataset.id);
      } catch (error) { this.context.toast(error.message); }
    });
  }
  get data() { return this.context.getData(); }
  reset() { this.price = null; this.replyFolder = ''; this.replyDraft = null; this.folderDraft = null; }
  dirty() { this.context.dirty(); }
  render(kind) {
    return `<div class="row extras-back">${button('‹ 全部组件', 'back')}<span class="grow"></span><span class="settings-note">${kind === 'price-list' ? '价目表与条目模板可分别保存' : '仅保存文字 · 可关联多个稿件模板'}</span></div>` + (kind === 'price-list' ? this.renderPrice() : this.renderReplies());
  }
  async commit(change, message, clean = true) {
    if (this.saving) return false;
    this.saving = true;
    try {
      const candidate = copy(this.data);
      change(candidate);
      validateBackup(candidate); // Reject bad references before changing the working state.
      Object.assign(this.data, candidate);
      if (!(await this.context.persist())) return false;
      if (clean) this.context.clean();
      this.context.toast(message);
      return true;
    } finally { this.saving = false; }
  }
  setRecord(data, key, record) {
    const index = data[key].findIndex((item) => item.id === record.id);
    if (index < 0) data[key].push(copy(record)); else data[key][index] = copy(record);
  }
  ensurePrice() {
    if (!this.price) this.price = { list: copy(this.data.priceLists[0] || newList()), editing: null, libraryId: '' };
    return this.price;
  }
  renderPrice() {
    const { list, editing } = this.ensurePrice();
    return `<div class="page-intro"><div><h1>价目表</h1><p>拖入条目模板，调整图片、文字和排列后导出。</p></div><div class="row">${button('新建价目表', 'list-new')}${button('保存价目表', 'list-save', '', 'primary')}</div></div><div class="price-workspace"><aside class="panel price-settings"><div class="extra-section"><h3>价目表设置</h3><label class="field"><span>选择已保存的价目表</span><select data-extra-change="list-select">${option('', '选择价目表', '')}${this.data.priceLists.map((item) => option(item.id, item.name, list.id)).join('')}</select></label>${field('价目表名称', 'list.name', list.name, 'text', 'maxlength="100" placeholder="输入名称后保存"')}<div class="form-grid">${field('画布宽度', 'list.width', list.width, 'number', 'min="600" max="2400" step="1"')}${field('列数', 'list.columns', list.columns, 'number', 'min="1" max="4" step="1"')}${field('单条高度', 'list.cardHeight', list.cardHeight, 'number', 'min="280" max="900" step="1"')}${field('条目间距', 'list.gap', list.gap, 'number', 'min="8" max="100" step="1"')}${field('画布边距', 'list.padding', list.padding, 'number', 'min="20" max="120" step="1"')}${field('背景颜色', 'list.bg', list.bg, 'color')}</div><div class="row wrap">${button('上传底图', 'list-background')}${list.backgroundImage ? button('清除底图', 'list-background-clear') : ''}</div><div class="row wrap">${button('另存为新价目表', 'list-save-new')}${this.data.priceLists.some((item) => item.id === list.id) ? button('删除价目表', 'list-delete', '', 'small danger') : ''}</div></div><div class="extra-section"><div class="row between"><h3>价目条目模板</h3>${button('新建条目', 'entry-new')}</div><p class="hint">拖入右侧价目表，或点击“加入”。拖动已加入的条目可调整顺序。</p><div class="price-entry-library">${this.data.priceEntries.map((item) => `<article class="price-library-entry" draggable="true" data-price-drag="template" data-id="${item.id}">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">` : '<div class="price-library-placeholder">无图片</div>'}<div><strong>${esc(item.name)}</strong><span>${money(item.price)}</span><div class="row">${button('加入', 'entry-add', `data-id="${item.id}"`)}${button('编辑', 'entry-template-edit', `data-id="${item.id}"`)}</div></div></article>`).join('') || '<p class="empty">暂无条目模板。新建条目后可单独保存。</p>'}</div></div></aside><section class="panel price-preview-panel"><div class="row between"><h3>排列预览 <small>${list.items.length} 个条目</small></h3><div class="row">${button('复制图片', 'list-copy')}${button('导出 JPG', 'list-export', '', 'primary')}</div></div><div class="price-board" data-price-drop style="background-color:${list.bg};${list.backgroundImage ? `background-image:url('${esc(list.backgroundImage)}');` : ''}--price-columns:${list.columns};--price-gap:${Math.max(6, list.gap / 3)}px"><div class="price-board-title">${esc(list.name || '未命名价目表')}</div><div class="price-board-grid">${list.items.map((item, index) => `<article class="price-preview-entry" draggable="true" data-price-drag="item" data-id="${item.id}" style="background:${item.bg};color:${item.color}"><button class="price-picture" data-extra="entry-edit" data-id="${item.id}">${item.image ? `<img style="object-fit:${item.fit}" src="${esc(item.image)}" alt="${esc(item.name)}">` : '<span>点击添加图片</span>'}</button><div class="price-entry-caption"><strong>${esc(item.name)}</strong><span>${money(item.price)}</span><p>${esc(item.description)}</p></div><div class="price-entry-actions">${button('编辑', 'entry-edit', `data-id="${item.id}"`)}${button('↑', 'entry-move', `data-id="${item.id}" data-delta="-1" aria-label="上移${esc(item.name)}" ${index === 0 ? 'disabled' : ''}`)}${button('↓', 'entry-move', `data-id="${item.id}" data-delta="1" aria-label="下移${esc(item.name)}" ${index === list.items.length - 1 ? 'disabled' : ''}`)}${button('移除', 'entry-remove', `data-id="${item.id}"`)}</div></article>`).join('')}</div>${!list.items.length ? '<div class="price-drop-empty">拖入左侧条目模板，或新建一个价目条目。</div>' : ''}${button('＋ 新建条目', 'entry-new', '', 'price-add-entry')}</div><p class="hint">拖动可更改顺序；下方为实际导出画布，图片区域约占单条卡片的 72%。</p><canvas id="price-output" aria-label="价目表导出预览"></canvas></section></div>${editing ? this.renderEntryEditor() : ''}`;
  }
  renderEntryEditor() {
    const item = this.price.editing;
    return `<section class="panel extra-editor" id="price-entry-editor"><div class="row between"><h2>${this.price.libraryId ? '编辑条目模板' : '编辑价目条目'}</h2>${button('关闭', 'entry-cancel')}</div><div class="extra-entry-form"><div class="price-edit-image">${item.image ? `<img src="${esc(item.image)}" alt="条目图片">` : '<span>添加条目图片</span>'}<div class="row">${button('上传图片', 'entry-image')}${item.image ? button('移除图片', 'entry-image-clear') : ''}</div></div><form id="price-entry-form"><div class="form-grid">${field('名称', 'entry.name', item.name, 'text', 'required maxlength="100"')}${field('价格 / 元', 'entry.price', item.price, 'number', 'required min="0" max="10000000" step="0.01"')}${field('卡片颜色', 'entry.bg', item.bg, 'color')}${field('文字颜色', 'entry.color', item.color, 'color')}<label class="field"><span>图片放置方式</span><select data-extra-field="entry.fit">${option('cover', '填满图片区域', item.fit)}${option('contain', '完整显示图片', item.fit)}</select></label><label class="field full"><span>说明（可选）</span><textarea data-extra-field="entry.description" maxlength="30000">${esc(item.description)}</textarea></label></div><div class="row wrap">${button(this.price.libraryId ? '更新条目模板' : '应用到价目表', 'entry-apply', '', 'primary')}${button('另存为条目模板', 'entry-save-template')}${this.price.libraryId ? button('删除条目模板', 'entry-delete-template', '', 'small danger') : ''}</div></form></div></section>`;
  }
  folderOptions(selected = '', exclude = '') {
    const output = [option('', '未分组', selected)];
    const walk = (parent, level) => {
      this.data.replyFolders.filter((item) => item.parent === parent && item.id !== exclude).forEach((item) => { output.push(option(item.id, '　'.repeat(level) + item.name, selected)); walk(item.id, level + 1); });
    };
    walk('', 0);
    return output.join('');
  }
  renderReplies() {
    const folders = this.data.replyFolders;
    if (this.replyFolder && !folders.some((item) => item.id === this.replyFolder)) this.replyFolder = '';
    const tree = (parent, level = 0) => folders.filter((item) => item.parent === parent).map((item) => `<div class="reply-tree-row ${item.id === this.replyFolder ? 'active' : ''}" style="--depth:${level}"><button data-extra="reply-folder" data-id="${item.id}"><span>▸</span>${esc(item.name)}<small>${this.data.replyTemplates.filter((reply) => reply.parent === item.id).length}</small></button>${button('编辑', 'folder-edit', `data-id="${item.id}"`)}</div>${tree(item.id, level + 1)}`).join('');
    const replies = this.data.replyTemplates.filter((reply) => (!this.replyFolder || reply.parent === this.replyFolder) && (!this.replyTemplateFilter || reply.templateIds.includes(this.replyTemplateFilter)) && (!this.replySearch || [reply.title, reply.body].join(' ').toLowerCase().includes(this.replySearch.toLowerCase())));
    const current = folders.find((item) => item.id === this.replyFolder);
    return `<div class="page-intro"><div><h1>快捷回复</h1><p>按层级整理常用文字，单独关联一个或多个稿件模板。</p></div>${button('新建文字模板', 'reply-new', '', 'primary')}</div><div class="reply-workspace"><aside class="panel reply-sidebar"><div class="row between"><h3>文字分组</h3>${button('新建分组', 'folder-new')}</div><div class="reply-tree-row ${!this.replyFolder ? 'active' : ''}"><button data-extra="reply-folder" data-id="">全部文字<small>${this.data.replyTemplates.length}</small></button></div>${tree('')}<div class="reply-presets"><h3>可选常用分组</h3><p class="hint">勾选后添加，内容由你填写。</p>${['订单回复', '首页介绍', '评价模板', '回答模板'].map((name, index) => `<label class="check-row"><input type="checkbox" data-reply-preset="${index}" value="${name}" ${folders.some((f) => f.name === name && !f.parent) ? 'checked disabled' : ''}>${name}</label>`).join('')}${button('添加勾选分组', 'folder-presets')}</div></aside><section class="panel reply-main"><div class="row between"><div><h2>${esc(current?.name || '全部文字')}</h2><p class="hint">${replies.length} 条文字模板</p></div>${current ? button('新建子分组', 'folder-child') : ''}</div><div class="reply-filters"><label class="searchbox"><input data-extra-search value="${esc(this.replySearch)}" placeholder="搜索标题或文字内容" aria-label="搜索快捷回复"></label><select data-extra-change="reply-filter" aria-label="按关联稿件模板筛选">${option('', '全部稿件模板', this.replyTemplateFilter)}${this.data.templates.map((item) => option(item.id, item.title, this.replyTemplateFilter)).join('')}</select></div><div class="reply-list">${replies.map((reply) => `<article class="reply-card"><div class="row between"><h3>${esc(reply.title)}</h3><div class="row">${button('复制文字', 'reply-copy', `data-id="${reply.id}"`)}${button('编辑', 'reply-edit', `data-id="${reply.id}"`)}${button('删除', 'reply-delete', `data-id="${reply.id}"`)}</div></div><p class="reply-body">${esc(reply.body || '未填写文字')}</p><div class="reply-links"><span>${esc(folders.find((f) => f.id === reply.parent)?.name || '未分组')}</span>${reply.templateIds.map((id) => `<span>${esc(this.data.templates.find((t) => t.id === id)?.title || '')}</span>`).join('') || '<small>未关联稿件模板</small>'}</div></article>`).join('') || '<div class="empty">暂无文字模板。点击右上角新建。</div>'}</div></section></div>${this.folderDraft ? this.renderFolderEditor() : ''}${this.replyDraft ? this.renderReplyEditor() : ''}`;
  }
  renderFolderEditor() {
    const folder = this.folderDraft;
    return `<section class="panel extra-editor" id="reply-folder-editor"><div class="row between"><h2>编辑文字分组</h2>${button('关闭', 'folder-cancel')}</div><form id="reply-folder-form"><div class="form-grid">${field('分组名称', 'folder.name', folder.name, 'text', 'required maxlength="100"')}<label class="field"><span>上级分组</span><select data-extra-field="folder.parent">${this.folderOptions(folder.parent, folder.id)}</select></label></div><div class="row">${button('保存分组', 'folder-save', '', 'primary')}${this.data.replyFolders.some((item) => item.id === folder.id) ? button('删除分组', 'folder-delete', '', 'small danger') : ''}</div></form></section>`;
  }
  renderReplyEditor() {
    const reply = this.replyDraft;
    return `<section class="panel extra-editor" id="reply-editor"><div class="row between"><h2>编辑文字模板</h2>${button('关闭', 'reply-cancel')}</div><form id="reply-form"><div class="form-grid">${field('标题', 'reply.title', reply.title, 'text', 'required maxlength="100"')}<label class="field"><span>所属分组</span><select data-extra-field="reply.parent">${this.folderOptions(reply.parent)}</select></label><label class="field full"><span>文字内容</span><textarea data-extra-field="reply.body" maxlength="30000" placeholder="填写需要快捷复制的文字">${esc(reply.body)}</textarea></label></div><h3>关联稿件模板（可选，可多选）</h3><div class="reply-template-choices">${this.data.templates.map((item) => `<label class="check-row"><input type="checkbox" data-reply-template="${item.id}" ${reply.templateIds.includes(item.id) ? 'checked' : ''}>${esc(item.title)}</label>`).join('') || '<p class="hint">暂无稿件模板，后续可以再关联。</p>'}</div><div class="row">${button('保存文字模板', 'reply-save', '', 'primary')}${button('复制当前文字', 'reply-copy-draft')}</div></form></section>`;
  }
  input(el) {
    const name = el.dataset.extraField;
    if (name) {
      const [scope, key] = name.split('.');
      const object = scope === 'list' ? this.price?.list : scope === 'entry' ? this.price?.editing : scope === 'folder' ? this.folderDraft : this.replyDraft;
      if (!object) return;
      object[key] = el.type === 'number' ? Number(el.value) : el.value;
      this.dirty();
      if (scope === 'list') {
        this.syncPriceBoard();
        clearTimeout(this.priceTimer);
        this.priceTimer = setTimeout(() => this.drawPrice().catch((error) => this.context.toast(error.message)), 180);
      }
    }
    if (el.hasAttribute('data-extra-search')) {
      this.replySearch = el.value;
      const caret = el.selectionStart;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => { this.context.render(); const input = document.querySelector('[data-extra-search]'); input?.focus(); input?.setSelectionRange(caret, caret); }, 180);
    }
  }
  change(el) {
    if (el.dataset.extraField && el.tagName === 'SELECT') this.input(el);
    if (el.dataset.extraChange === 'list-select' && el.value) { this.price = { list: copy(this.data.priceLists.find((item) => item.id === el.value)), editing: null, libraryId: '' }; this.context.clean(); this.context.render(); }
    if (el.dataset.extraChange === 'reply-filter') { this.replyTemplateFilter = el.value; this.context.render(); }
    if (el.hasAttribute('data-reply-template') && this.replyDraft) { const id = el.dataset.replyTemplate; this.replyDraft.templateIds = el.checked ? [...new Set([...this.replyDraft.templateIds, id])] : this.replyDraft.templateIds.filter((value) => value !== id); this.dirty(); }
    if (el.dataset.extraField?.startsWith('list.')) this.syncPriceBoard();
  }
  insertEntry(kind, id, before) {
    const { list } = this.ensurePrice();
    const index = list.items.findIndex((item) => item.id === id);
    if (kind === 'item' && (index < 0 || id === before)) return;
    if (kind !== 'item' && list.items.length >= 100) throw Error('单张价目表最多 100 个条目。');
    const source = kind === 'item' ? list.items.splice(index, 1)[0] : copy(this.data.priceEntries.find((item) => item.id === id));
    if (!source) throw Error('条目模板不存在，请刷新后重试。');
    if (kind !== 'item') source.id = uid();
    const target = list.items.findIndex((item) => item.id === before);
    list.items.splice(target < 0 ? list.items.length : target, 0, source);
    this.dirty(); this.context.render();
  }
  validEntry() {
    const form = document.querySelector('#price-entry-form');
    if (!form?.reportValidity()) return false;
    if (!this.price.editing.name.trim()) { this.context.toast('请填写条目名称。'); return false; }
    this.price.editing.name = this.price.editing.name.trim();
    return true;
  }
  async action(action, el) {
    const id = el.dataset.id;
    const rerender = () => this.context.render();
    if (action === 'back') { this.context.back(); return; }
    if (action === 'list-new') { this.price = { list: newList(), editing: null, libraryId: '' }; this.context.clean(); rerender(); }
    if (action === 'list-save' || action === 'list-save-new') {
      const list = copy(this.price.list);
      if (!list.name.trim()) throw Error('请先填写价目表名称。');
      if (this.price.editing) throw Error('请先应用或关闭正在编辑的价目条目。');
      list.name = list.name.trim();
      if (action === 'list-save-new') list.id = uid();
      if (await this.commit((data) => this.setRecord(data, 'priceLists', list), '价目表已保存到电脑')) { this.price.list = list; rerender(); }
    }
    if (action === 'list-delete' && confirm('删除这张价目表？单独保存的条目模板会保留。')) {
      if (await this.commit((data) => { data.priceLists = data.priceLists.filter((item) => item.id !== this.price.list.id); }, '价目表已删除')) { this.price = null; rerender(); }
    }
    if (action === 'list-background') this.context.upload((src) => { if (src) { this.price.list.backgroundImage = src; this.dirty(); rerender(); } });
    if (action === 'list-background-clear') { this.price.list.backgroundImage = ''; this.dirty(); rerender(); }
    if (action === 'entry-new') { this.price.editing = newEntry(); this.price.libraryId = ''; rerender(); document.querySelector('#price-entry-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'entry-edit' || action === 'entry-template-edit') { this.price.editing = copy((action === 'entry-edit' ? this.price.list.items : this.data.priceEntries).find((item) => item.id === id)); this.price.libraryId = action === 'entry-template-edit' ? id : ''; rerender(); document.querySelector('#price-entry-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'entry-cancel') { this.price.editing = null; this.price.libraryId = ''; rerender(); }
    if (action === 'entry-image') this.context.upload((src) => { if (src) { this.price.editing.image = src; this.dirty(); rerender(); } });
    if (action === 'entry-image-clear') { this.price.editing.image = ''; this.dirty(); rerender(); }
    if (action === 'entry-apply' && this.validEntry()) {
      if (this.price.libraryId) {
        if (await this.commit((data) => this.setRecord(data, 'priceEntries', this.price.editing), '条目模板已更新；已加入价目表的条目保留原内容', false)) this.price.editing = null;
      } else {
        const index = this.price.list.items.findIndex((item) => item.id === this.price.editing.id);
        if (index < 0 && this.price.list.items.length >= 100) throw Error('单张价目表最多 100 个条目。');
        if (index < 0) this.price.list.items.push(copy(this.price.editing)); else this.price.list.items[index] = copy(this.price.editing);
        this.price.editing = null; this.dirty();
      }
      this.price.libraryId = ''; rerender();
    }
    if (action === 'entry-save-template' && this.validEntry()) {
      const entry = { ...copy(this.price.editing), id: uid() };
      if (await this.commit((data) => data.priceEntries.push(entry), '已另存为条目模板', false)) rerender();
    }
    if (action === 'entry-delete-template' && confirm('删除该条目模板？已加入价目表的内容会保留。')) {
      if (await this.commit((data) => { data.priceEntries = data.priceEntries.filter((item) => item.id !== this.price.libraryId); }, '条目模板已删除', false)) { this.price.editing = null; this.price.libraryId = ''; rerender(); }
    }
    if (action === 'entry-add') this.insertEntry('template', id);
    if (action === 'entry-remove') { this.price.list.items = this.price.list.items.filter((item) => item.id !== id); this.dirty(); rerender(); }
    if (action === 'entry-move') {
      const items = this.price.list.items, index = items.findIndex((item) => item.id === id), target = index + Number(el.dataset.delta);
      if (index >= 0 && target >= 0 && target < items.length) { [items[index], items[target]] = [items[target], items[index]]; this.dirty(); rerender(); }
    }
    if (action === 'list-copy' || action === 'list-export') {
      if (!this.price.list.items.length) throw Error('请先加入至少一个价目条目。');
      await this.drawPrice();
      const canvas = document.querySelector('#price-output');
      if (action === 'list-copy') {
        if (!navigator.clipboard?.write || !window.ClipboardItem) throw Error('当前浏览器不支持复制图片，请使用“导出 JPG”。');
        // Start clipboard write during the user gesture; PNG is the clipboard image format.
        const blob = new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(Error('图片生成失败。')), 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.context.toast('价目表图片已复制');
      } else {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .94));
        if (!blob) throw Error('图片生成失败。');
        const url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url; anchor.download = (this.price.list.name || '价目表').replace(/[<>:"/\\|?*]/g, '_') + '.jpg'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.context.toast('价目表 JPG 已生成');
      }
    }
    if (action === 'folder-presets') {
      const names = [...document.querySelectorAll('[data-reply-preset]:checked:not(:disabled)')].map((item) => item.value);
      if (!names.length) throw Error('请先勾选要添加的分组。');
      if (await this.commit((data) => names.forEach((name) => { if (!data.replyFolders.some((item) => item.name === name && !item.parent)) data.replyFolders.push({ id: uid(), name, parent: '' }); }), '已添加勾选的文字分组')) rerender();
    }
    if (action === 'reply-folder') { this.replyFolder = id; rerender(); }
    if (action === 'folder-new' || action === 'folder-child') { this.folderDraft = { id: uid(), name: '', parent: action === 'folder-child' ? this.replyFolder : '' }; rerender(); document.querySelector('#reply-folder-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'folder-edit') { this.folderDraft = copy(this.data.replyFolders.find((item) => item.id === id)); rerender(); document.querySelector('#reply-folder-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'folder-cancel') { this.folderDraft = null; rerender(); }
    if (action === 'folder-save' && document.querySelector('#reply-folder-form')?.reportValidity()) {
      const folder = copy(this.folderDraft); folder.name = folder.name.trim();
      if (await this.commit((data) => this.setRecord(data, 'replyFolders', folder), '文字分组已保存')) { this.replyFolder = folder.id; this.folderDraft = null; rerender(); }
    }
    if (action === 'folder-delete' && confirm('删除这个分组？其文字和子分组会移到上一级，不会删除文字内容。')) {
      const folder = this.folderDraft;
      if (await this.commit((data) => { data.replyFolders = data.replyFolders.filter((item) => item.id !== folder.id); data.replyFolders.forEach((item) => { if (item.parent === folder.id) item.parent = folder.parent; }); data.replyTemplates.forEach((item) => { if (item.parent === folder.id) item.parent = folder.parent; }); }, '分组已删除，文字和子分组已保留')) { this.replyFolder = folder.parent; this.folderDraft = null; rerender(); }
    }
    if (action === 'reply-new') { this.replyDraft = { id: uid(), title: '', body: '', parent: this.replyFolder, templateIds: [] }; rerender(); document.querySelector('#reply-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'reply-edit') { this.replyDraft = copy(this.data.replyTemplates.find((item) => item.id === id)); rerender(); document.querySelector('#reply-editor')?.scrollIntoView({ block: 'center' }); }
    if (action === 'reply-cancel') { this.replyDraft = null; rerender(); }
    if (action === 'reply-save' && document.querySelector('#reply-form')?.reportValidity()) {
      const reply = copy(this.replyDraft); reply.title = reply.title.trim();
      if (await this.commit((data) => this.setRecord(data, 'replyTemplates', reply), '文字模板已保存')) { this.replyDraft = null; rerender(); }
    }
    if (action === 'reply-delete' && confirm('删除这条文字模板？稿件模板和其他文字内容会保留。')) {
      if (await this.commit((data) => { data.replyTemplates = data.replyTemplates.filter((item) => item.id !== id); }, '文字模板已删除')) rerender();
    }
    if (action === 'reply-copy' || action === 'reply-copy-draft') await this.copyText(action === 'reply-copy-draft' ? this.replyDraft.body : this.data.replyTemplates.find((item) => item.id === id)?.body || '');
  }
  async copyText(text) {
    if (!text) throw Error('这条模板没有文字，请先编辑内容。');
    try { await navigator.clipboard.writeText(text); }
    catch {
      const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); const ok = document.execCommand('copy'); input.remove(); if (!ok) throw Error('复制失败，请检查浏览器剪贴板权限。');
    }
    this.context.toast('文字已复制');
  }
  afterRender(kind) {
    if (kind === 'price-list') { this.syncPriceBoard(); this.drawPrice().catch((error) => this.context.toast(error.message)); }
  }
  syncPriceBoard() {
    const board = document.querySelector('.price-board'), list = this.price?.list;
    if (!board || !list) return;
    board.style.backgroundColor = list.bg;
    board.style.setProperty('--price-columns', Math.max(1, Math.min(4, list.columns)));
    board.style.setProperty('--price-gap', Math.max(6, list.gap / 3) + 'px');
    board.style.setProperty('--price-picture-aspect', Math.max(.2, (list.width - list.padding * 2 - list.gap * (list.columns - 1)) / Math.max(1, list.columns) / (list.cardHeight * .72)));
    board.querySelector('.price-board-title').textContent = list.name || '未命名价目表';
  }
  async drawPrice() {
    const canvas = document.querySelector('#price-output');
    if (!canvas || !this.price) return;
    const version = this.drawVersion = (this.drawVersion || 0) + 1;
    const list = copy(this.price.list);
    const numeric = ['width', 'columns', 'cardHeight', 'gap', 'padding'];
    if (numeric.some((key) => !Number.isFinite(list[key])) || list.columns < 1 || list.columns > 4 || !Number.isInteger(list.columns) || list.width < 600 || list.width > 2400 || list.cardHeight < 280 || list.cardHeight > 900 || list.gap < 8 || list.gap > 100 || list.padding < 20 || list.padding > 120) throw Error('请检查价目表画布尺寸、列数和间距。');
    const rows = Math.max(1, Math.ceil(list.items.length / list.columns));
    const height = list.padding * 2 + 80 + rows * list.cardHeight + (rows - 1) * list.gap;
    if (list.width * height > 32000000) throw Error('导出画布过大，请减少条目、列宽或单条高度，或拆成多张价目表。');
    const images = await Promise.all([list.backgroundImage ? loadImage(list.backgroundImage) : null, ...list.items.map((item) => item.image ? loadImage(item.image) : null)]);
    if (version !== this.drawVersion || !canvas.isConnected) return;
    canvas.width = list.width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = list.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const image = (img, x, y, width, height, fit = 'cover') => {
      const scale = fit === 'contain' ? Math.min(width / img.width, height / img.height) : Math.max(width / img.width, height / img.height);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip(); ctx.drawImage(img, x + (width - img.width * scale) / 2, y + (height - img.height * scale) / 2, img.width * scale, img.height * scale); ctx.restore();
    };
    if (images[0]) image(images[0], 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#242424'; ctx.font = '500 38px "Microsoft YaHei", sans-serif'; ctx.fillText(list.name || '价目表', list.padding, list.padding + 37, list.width - list.padding * 2);
    const width = (list.width - list.padding * 2 - list.gap * (list.columns - 1)) / list.columns;
    if (width < 80) throw Error('价目条目宽度不足，请减少间距或列数。');
    list.items.forEach((entry, index) => {
      const x = list.padding + index % list.columns * (width + list.gap), y = list.padding + 80 + Math.floor(index / list.columns) * (list.cardHeight + list.gap), pictureHeight = list.cardHeight * .72;
      ctx.fillStyle = entry.bg; ctx.fillRect(x, y, width, list.cardHeight);
      if (images[index + 1]) image(images[index + 1], x, y, width, pictureHeight, entry.fit);
      else { ctx.fillStyle = '#e3e3e3'; ctx.fillRect(x, y, width, pictureHeight); ctx.fillStyle = '#777777'; ctx.font = '20px "Microsoft YaHei", sans-serif'; ctx.fillText('未添加图片', x + 22, y + pictureHeight / 2); }
      const scale = Math.min(1, (list.cardHeight - pictureHeight) / 125);
      ctx.fillStyle = entry.color; ctx.font = `500 ${28 * scale}px "Microsoft YaHei", sans-serif`; ctx.fillText(entry.name, x + 20, y + pictureHeight + 38 * scale, width - 40);
      ctx.font = `${26 * scale}px "Microsoft YaHei", sans-serif`; ctx.fillText(money(entry.price), x + 20, y + pictureHeight + 74 * scale, width - 40);
      if (entry.description) { ctx.font = `${18 * scale}px "Microsoft YaHei", sans-serif`; ctx.fillText(entry.description.replace(/\s+/g, ' '), x + 20, y + pictureHeight + 104 * scale, width - 40); }
    });
    return canvas;
  }
}
