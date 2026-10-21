import { dateKey, rushColor, moveOrderDates, eventOnDay } from './workspace-model.js';

const esc = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const ink = (color) => {
    const value = color.slice(1),
        rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 150 ? '#242424' : '#ffffff';
};
const uid = () => crypto.randomUUID();
const clone = (value) => structuredClone(value);
const button = (label, action, attrs = '', kind = 'small') =>
    `<button type="button" class="btn ${kind}" data-ws="${action}" ${attrs}>${label}</button>`;
const field = (label, name, value = '', type = 'text', attrs = '') =>
    `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const icons = {
    water: '<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
    exercise: '<path d="m6 3-3 3 15 15 3-3M3 9l6-6m6 18 6-6M7 17l10-10"/>',
    clean: '<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Zm6 13 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/>',
    custom: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8m-4-4h8"/>',
};
const symbol = (kind) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${icons[kind] || icons.custom}</svg>`;
const today = () => dateKey(new Date());
const monthTitle = (date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;
const eventTime = (item) =>
    [item.start, item.end]
        .filter(Boolean)
        .map((value) => value.replace('T', ' '))
        .join(' — ') || '未设置时间';

export class WorkspaceUI {
    constructor(context) {
        this.ctx = context;
        this.folder = '';
        this.albumPage = 1;
        this.selection = new Set();
        this.lifeTab = 'events';
        this.eventsFull = false;
        this.lifeMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        this.editor = null;
        this.busy = false;
        this.spinning = new Set();
        this.foodLists = new Set();
        this.foodResults = {};
        this.datePicker = null;
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-ws]');
            if (target) {
                event.preventDefault();
                event.stopPropagation();
                if (!this.busy)
                    this.action(target.dataset.ws, target).catch((error) =>
                        context.toast(error.message),
                    );
            } else if (
                !event.target.closest('.schedule-date-popover,input[name=start],input[name=due]')
            )
                this.closeDatePicker();
        });
        document.addEventListener('submit', (event) => {
            if (
                event.target.id === 'workspace-form' ||
                event.target.id === 'life-quick-form' ||
                event.target.id === 'todo-quick-form'
            ) {
                event.preventDefault();
                if (!this.busy)
                    this.submit(event.target).catch((error) => context.toast(error.message));
            }
        });
        document.addEventListener('change', (event) => {
            if (event.target.matches('[data-ws-select]')) {
                const id = event.target.dataset.wsSelect;
                event.target.checked ? this.selection.add(id) : this.selection.delete(id);
                context.render();
            }
        });
        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key === 'Escape' && this.datePicker) {
                    event.stopImmediatePropagation();
                    event.preventDefault();
                    this.closeDatePicker();
                }
            },
            true,
        );
        document.addEventListener('dragstart', (event) => this.dragStart(event));
        document.addEventListener('dragover', (event) => {
            if (
                event.target.closest(
                    '[data-portfolio-drop],[data-schedule-date],.schedule-range-week',
                )
            ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
                    'application/x-lotus-order',
                )
                    ? 'move'
                    : 'copy';
            }
        });
        document.addEventListener('drop', (event) =>
            this.drop(event).catch((error) => context.toast(error.message)),
        );
    }
    get data() {
        return this.ctx.getData();
    }
    async commit(change) {
        if (this.busy) throw Error('正在保存，请稍后。');
        const before = clone(this.data);
        this.busy = true;
        try {
            change(this.data);
            if (!(await this.ctx.persist())) {
                this.ctx.restore(before);
                throw Error('修改尚未保存，请保留页面并检查本机连接。');
            }
        } catch (error) {
            this.ctx.restore(before);
            throw error;
        } finally {
            this.busy = false;
        }
    }
    dialog(kind, title, body, item = {}, foot = '') {
        this.editor = { kind, item: clone(item) };
        this.ctx.dialog(
            title,
            `<form id="workspace-form">${body}</form>`,
            `${foot}${button('取消', 'dialog-close')}<button type="submit" form="workspace-form" class="btn primary">保存</button>`,
        );
    }
    async confirm(title, text, change) {
        this.ctx.confirm(title, esc(text), async () => {
            await this.commit(change);
            this.ctx.close();
            this.ctx.render();
        });
    }
    rushCards() {
        return `<section class="rush-templates" aria-label="特殊限时模板">${[24, 48].map((hours) => `<article class="rush-template" style="--rush:${rushColor(this.data, hours)};--rush-ink:${ink(rushColor(this.data, hours))}"><div class="rush-template-color"><strong>${hours}h</strong><span>特殊模板</span></div><div><p>确认建立后 ${hours} 小时截稿</p><small>单主、稿件类别可稍后补充</small><div class="row">${button('选择颜色', 'rush-style', `data-hours="${hours}"`)}${button('使用模板', 'rush-use', `data-hours="${hours}"`, 'small primary')}</div></div></article>`).join('')}</section>`;
    }
    renderPortfolio() {
        const folders = this.data.portfolioFolders,
            images = this.data.portfolioImages.filter(
                (item) => (item.folder || '') === this.folder,
            );
        const folder = folders.find((item) => item.id === this.folder),
            cover = this.data.portfolioCover || { title: '', color: '#242424', image: '' };
        const pages = [{ cover: true }, ...images, { blank: true }];
        this.albumPage = Math.max(0, Math.min(this.albumPage, pages.length - 1));
        return `<div class="page-intro"><div><h1>作品展示</h1><p>按图片加入顺序展示。拖入图片可保存到当前文件夹。</p></div><div class="row">${button('封面设置', 'cover-edit')}${button('新建文件夹', 'folder-new')}${button('加入图片', 'portfolio-upload', '', 'primary')}</div></div><div class="portfolio-path">${button('全部作品', 'folder-open', 'data-id=""')} ${folder ? `<span>／ ${esc(folder.name)}</span>${button('返回上层', 'folder-open', `data-id="${folder.parent || ''}"`)}` : ''}</div><section class="portfolio-book-panel"><div class="accordion-book" data-portfolio-drop="${esc(this.folder)}" aria-label="风琴本作品展示">${pages
            .map((item, index) => ({ item, index }))
            .filter(({ index }) => index === 0 || Math.abs(index - this.albumPage) <= 2)
            .map(
                ({ item, index }) =>
                    `<button type="button" data-ws="album-page" data-index="${index}" class="album-leaf ${index === this.albumPage ? 'current' : ''} ${item.cover ? 'album-cover' : ''} ${index < this.albumPage ? 'fold-before' : 'fold-after'}" aria-label="${item.cover ? '封面' : item.blank ? '空白内页' : esc(item.name)}" style="${item.cover ? `--cover:${cover.color};color:${ink(cover.color)}` : ''}">${item.cover ? `${cover.image ? `<img src="${esc(cover.image)}" alt="封面">` : ''}<span>${esc(cover.title)}</span>` : item.src ? `<img src="${esc(item.src)}" alt="${esc(item.name)}">` : '<span class="album-drop-label">拖入图片 / 点击下方加入图片</span>'}<small class="album-page-number">${item.cover ? '封面' : index}</small></button>`,
            )
            .join(
                '',
            )}</div><div class="album-controls">${button('上一页', 'album-prev', '', 'small')}<span>${this.albumPage === 0 ? '封面' : `${this.albumPage} / ${pages.length - 1}`}</span>${button('下一页', 'album-next')}<small>最后一页保持展开</small></div></section><section class="panel portfolio-library"><div class="panel-header"><h2>查看</h2><div class="row"><span>${images.length} 张图片</span>${button(this.selection.size ? '取消全选' : '多选 / 全选', 'portfolio-select')}${this.selection.size ? button('删除所选', 'portfolio-delete', '', 'small danger') : ''}</div></div><div class="portfolio-folder-row">${folders
            .filter((item) => (item.parent || '') === this.folder)
            .map(
                (item) =>
                    `<article class="portfolio-folder" data-portfolio-drop="${item.id}">${button('▤ ' + esc(item.name), 'folder-open', `data-id="${item.id}"`)}${button('改名', 'folder-rename', `data-id="${item.id}"`)}${button('删除', 'folder-delete', `data-id="${item.id}"`, 'small danger')}</article>`,
            )
            .join(
                '',
            )}</div>${this.selection.size ? `<label class="field portfolio-move"><span>将选中图片移动到</span><div class="row"><select id="portfolio-move-target"><option value="">全部作品</option>${folders.map((item) => `<option value="${item.id}" ${this.folder === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>${button('移动', 'portfolio-move')}</div></label>` : ''}<div class="portfolio-grid" data-portfolio-drop="${esc(this.folder)}">${images.map((item, index) => `<article class="portfolio-image" draggable="true" data-portfolio-drag="${item.id}"><input type="checkbox" data-ws-select="${item.id}" ${this.selection.has(item.id) ? 'checked' : ''} aria-label="选择${esc(item.name)}"><button data-ws="album-page" data-index="${index + 1}" type="button"><img src="${esc(item.src)}" alt="${esc(item.name)}"><span>${esc(item.name)}</span></button></article>`).join('') || '<div class="empty portfolio-empty">暂无图片。可将图片拖入风琴本或此区域。</div>'}</div></section>`;
    }
    lifeEventButtons(date) {
        return this.data.lifeEvents
            .filter((item) => eventOnDay(item, date))
            .map((item) => {
                const category = this.data.lifeCategories.find(
                    (value) => value.id === item.category,
                );
                return `<button class="life-calendar-event ${item.done ? 'done' : ''}" type="button" data-ws="event-edit" data-id="${item.id}" style="--event-color:${category?.color || '#777777'}"><strong>${esc(item.title)}</strong><small>${(item.start || item.end).slice(11, 16)}</small></button>`;
            })
            .join('');
    }
    eventRows(items) {
        return (
            items
                .map(
                    (item) =>
                        `<article class="life-event-row ${item.done ? 'done' : ''}"><button class="todo-circle ${item.done ? 'checked' : ''}" type="button" data-ws="event-toggle" data-id="${item.id}" aria-label="${item.done ? '标记未完成' : '完成事件'}">${item.done ? '✓' : ''}</button><button class="event-row-main" type="button" data-ws="event-edit" data-id="${item.id}"><strong>${esc(item.title)}</strong><small>${esc(eventTime(item))}</small>${item.content ? `<p>${esc(item.content)}</p>` : ''}</button>${button('编辑', 'event-edit', `data-id="${item.id}"`)}${button('删除', 'event-delete', `data-id="${item.id}"`, 'small danger')}</article>`,
                )
                .join('') || '<div class="empty">暂无事件。</div>'
        );
    }
    eventsPanel() {
        if (this.eventsFull)
            return `<section class="panel life-events-full"><div class="panel-header"><h2>全部事件</h2><div class="row">${button('返回日程', 'events-back')}${button('新建事件', 'event-new', '', 'primary')}</div></div><div class="life-event-list">${this.eventRows([...this.data.lifeEvents].sort((a, b) => (a.start || a.end || '9999').localeCompare(b.start || b.end || '9999')))}</div></section>`;
        const month = this.lifeMonth,
            start = new Date(month.getFullYear(), month.getMonth(), 1),
            offset = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - offset);
        return `<section class="panel life-agenda"><div class="panel-header"><h2>注意事件</h2><div class="row">${button('上一月', 'life-month', 'data-step="-1"')}<strong>${monthTitle(month)}</strong>${button('下一月', 'life-month', 'data-step="1"')}${button('全部事件', 'events-full')}${button('新建事件', 'event-new', '', 'primary')}</div></div><div class="life-calendar">${['一', '二', '三', '四', '五', '六', '日'].map((label) => `<div class="life-weekday">周${label}</div>`).join('')}${Array.from(
            { length: 42 },
            (_, index) => {
                const date = new Date(start);
                date.setDate(date.getDate() + index);
                const key = dateKey(date);
                return `<div class="life-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === today() ? 'today' : ''}"><button type="button" data-ws="event-new" data-date="${key}" class="life-day-number">${date.getDate()}</button>${this.lifeEventButtons(key)}</div>`;
            },
        ).join(
            '',
        )}</div><div class="event-quick-strip"><form id="life-quick-form"><input name="title" required maxlength="200" placeholder="新建事件" aria-label="快捷事件名称"><button class="btn primary" type="submit">添加</button>${button('完整填写', 'event-new')}</form><div class="untimed-events">${this.eventRows(this.data.lifeEvents.filter((item) => !item.start && !item.end))}</div></div></section>`;
    }
    chart() {
        const dates = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - 6 + i);
            return dateKey(date);
        });
        const widgets = this.data.healthWidgets,
            logs = this.data.healthLogs;
        return `<section class="panel health-chart-panel"><div class="panel-header"><div><h2>生活记录</h2><small>最近七天 · 各组件独立刻度</small></div><span>${today()}</span></div>${
            widgets.length
                ? `<div class="health-chart">${widgets
                      .map((widget) => {
                          const values = dates.map(
                                  (date) =>
                                      logs.find(
                                          (item) => item.widget === widget.id && item.date === date,
                                      )?.value || 0,
                              ),
                              maximum = Math.max(1, ...values);
                          return `<div class="health-chart-series"><div><strong>${esc(widget.name)}</strong><small>${esc(widget.unit)}</small></div><div class="health-bars">${values.map((value, i) => `<div class="health-bar-column"><span>${value}</span><i style="height:${(value / maximum) * 76}px"></i><small>${dates[i].slice(5).replace('-', '/')}</small></div>`).join('')}</div></div>`;
                      })
                      .join('')}</div>`
                : '<div class="empty">尚未选择健康组件。添加组件后，在此显示记录变化。</div>'
        }</section>`;
    }
    healthPanel() {
        return (
            this.chart() +
            `<section class="panel health-components"><div class="panel-header"><h2>生活健康</h2>${button('选择 / 新建功能', 'health-new', '', 'primary')}</div><div class="health-widget-grid">${
                this.data.healthWidgets
                    .map((widget) => {
                        const value =
                            this.data.healthLogs.find(
                                (item) => item.widget === widget.id && item.date === today(),
                            )?.value || 0;
                        return `<article class="health-widget"><div class="health-widget-head"><button class="health-icon" type="button" data-ws="health-toggle-controls" data-id="${widget.id}" aria-label="记录${esc(widget.name)}">${widget.icon ? `<img src="${esc(widget.icon)}" alt="${esc(widget.name)}">` : symbol(widget.kind)}</button>${button('编辑', 'health-edit', `data-id="${widget.id}"`)}</div><h3>${esc(widget.name)}</h3><div class="health-count"><strong>${value}</strong><span>${esc(widget.unit)}</span></div><div class="health-controls" data-health-controls="${widget.id}" hidden>${button('−', 'health-decrease', `data-id="${widget.id}"`)}${button('+', 'health-increase', `data-id="${widget.id}"`)}</div></article>`;
                    })
                    .join('') ||
                '<div class="empty">请选择喝水记录、每日运动、房间清洁，或自行新建功能。</div>'
            }</div></section>`
        );
    }
    foodPanel() {
        return `<div class="food-wheels">${[
            ['delivery', '外卖转盘'],
            ['dish', '菜式转盘'],
        ]
            .map(([kind, label]) => {
                const entries = this.data.foodEntries.filter((item) => item.kind === kind),
                    result = this.data.foodEntries.find(
                        (item) =>
                            item.id ===
                            (this.foodResults[kind] || this.data.foodLastChoices?.[kind]),
                    );
                return `<section class="panel food-wheel-panel"><div class="panel-header"><h2>${label}</h2>${button('添加内容', 'food-new', `data-kind="${kind}"`)}</div><div class="food-wheel" data-ws="food-list" data-kind="${kind}" role="button" tabindex="0" aria-label="查看${label}内容"><div class="food-wheel-disc" data-wheel="${kind}" style="--sectors:${Math.max(1, entries.length)}">${entries.length ? entries.map((item, i) => `<span style="--angle:${(i * 360) / entries.length}deg">${esc(item.name)}</span>`).join('') : '<span class="wheel-empty">尚未添加内容</span>'}</div><button type="button" class="food-wheel-center" data-ws="food-spin" data-kind="${kind}" ${this.spinning.has(kind) ? 'disabled' : ''}>${this.spinning.has(kind) ? '抽取中' : '抽取'}</button></div><div class="food-slot" aria-live="polite"><div class="food-slot-reel" data-slot="${kind}">${result ? `<button type="button" data-ws="food-edit" data-id="${result.id}">${esc(result.name)}</button>` : '<span>等待抽取</span>'}</div></div>${button('查看全部内容', 'food-list', `data-kind="${kind}"`)}${this.foodLists.has(kind) ? `<div class="food-entry-list">${entries.map((item) => `<article><button type="button" data-ws="food-edit" data-id="${item.id}"><strong>${esc(item.name)}</strong><small>${'★'.repeat(Math.floor(item.rating))}${'☆'.repeat(5 - Math.floor(item.rating))}</small></button>${button('删除', 'food-delete', `data-id="${item.id}"`, 'small danger')}</article>`).join('') || '<div class="empty">暂无内容。</div>'}</div>` : ''}</section>`;
            })
            .join('')}</div>`;
    }
    todoPanel() {
        return `<section class="panel todo-panel"><div class="panel-header"><h2>想做的事情</h2><small>${this.data.todoItems.filter((item) => item.done).length} / ${this.data.todoItems.length} 已完成</small></div><form id="todo-quick-form"><input name="title" required maxlength="300" placeholder="填写想做的事情" aria-label="想做的事情"><button type="submit" class="btn primary">新建</button></form><div class="todo-list">${this.data.todoItems.map((item) => `<article class="todo-row ${item.done ? 'done' : ''}"><button type="button" class="todo-circle ${item.done ? 'checked' : ''}" data-ws="todo-toggle" data-id="${item.id}" aria-label="${item.done ? '设为未完成' : '设为完成'}">${item.done ? '✓' : ''}</button><span>${esc(item.title)}</span>${button('编辑', 'todo-edit', `data-id="${item.id}"`)}${button('删除', 'todo-delete', `data-id="${item.id}"`, 'small danger')}</article>`).join('') || '<div class="empty">暂无待办事项。</div>'}</div></section>`;
    }
    renderLife() {
        return `<div class="page-intro"><div><h1>生活工具</h1><p>日程、健康记录与日常待办。</p></div></div><div class="life-tabs" role="tablist">${[
            ['events', '注意事件'],
            ['health', '生活健康'],
            ['food', '食物转盘'],
            ['todo', 'todolist'],
        ]
            .map(
                ([id, label]) =>
                    `<button type="button" data-ws="life-tab" data-tab="${id}" role="tab" aria-selected="${this.lifeTab === id}" class="${this.lifeTab === id ? 'active' : ''}">${label}</button>`,
            )
            .join(
                '',
            )}</div>${this.lifeTab === 'events' ? this.eventsPanel() + this.chart() : this.lifeTab === 'health' ? this.healthPanel() : this.lifeTab === 'food' ? this.foodPanel() : this.todoPanel()}`;
    }
    eventEditor(item = null, date = '') {
        item = clone(
            item || {
                id: uid(),
                title: '',
                category: '',
                start: date ? date + 'T00:00' : '',
                end: '',
                content: '',
                notes: '',
                done: false,
            },
        );
        this.dialog(
            'event',
            item.title ? '编辑事件' : '新建事件',
            `${field('事件名称 *', 'title', item.title, 'text', 'required maxlength="200"')}<label class="field"><span>事件类别（选填）</span><select name="category"><option value="">未填写</option>${this.data.lifeCategories.map((category) => `<option value="${category.id}" ${category.id === item.category ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select></label><details class="life-category-editor"><summary>新建事件类别</summary><div class="row"><input id="life-category-name" maxlength="40" placeholder="填写类别名称" aria-label="新事件类别"><input id="life-category-color" type="color" value="#777777" aria-label="事件类别颜色">${button('添加并选择', 'event-category-add')}</div></details><div class="form-grid">${field('开始时间（选填）', 'start', item.start, 'datetime-local')}${field('结束时间（选填）', 'end', item.end, 'datetime-local')}</div><label class="field"><span>具体内容（选填）</span><textarea name="content">${esc(item.content)}</textarea></label><label class="field"><span>备注（选填）</span><textarea name="notes">${esc(item.notes)}</textarea></label><label class="check-row"><input type="checkbox" name="done" ${item.done ? 'checked' : ''}>已完成</label><p class="hint">未填写时间的事件显示在快捷新建条下方；有时间的事件会同步到稿件日历。</p>`,
            item,
        );
    }
    healthEditor(item = null) {
        item = clone(item || { id: uid(), name: '', kind: 'custom', unit: '', step: 1, icon: '' });
        this.dialog(
            'health',
            this.data.healthWidgets.some((value) => value.id === item.id)
                ? '编辑健康组件'
                : '选择 / 新建功能',
            `<label class="field"><span>功能类型</span><select name="kind" id="health-kind"><option value="custom" ${item.kind === 'custom' ? 'selected' : ''}>自定义功能</option>${[
                ['water', '喝水记录'],
                ['exercise', '每日运动'],
                ['clean', '房间清洁'],
            ]
                .map(
                    ([id, label]) =>
                        `<option value="${id}" ${item.kind === id ? 'selected' : ''}>${label}</option>`,
                )
                .join(
                    '',
                )}</select></label>${field('组件名称 *', 'name', item.name, 'text', 'required maxlength="100"')}<div class="form-grid">${field('单位（选填）', 'unit', item.unit, 'text', 'maxlength="20"')}${field('每次增减数量', 'step', item.step, 'number', 'required min="0.01" max="100000" step="0.01"')}</div><div class="health-icon-preview" id="health-icon-preview">${item.icon ? `<img src="${esc(item.icon)}" alt="组件图标">` : symbol(item.kind)}</div>${button('上传小图标', 'health-icon')}${button('使用默认图标', 'health-icon-clear')}`,
            item,
            this.data.healthWidgets.some((value) => value.id === item.id)
                ? button('删除组件', 'health-delete', `data-id="${item.id}"`, 'danger left')
                : '',
        );
        document.querySelector('#health-kind').addEventListener('change', (event) => {
            const name = document.querySelector('#workspace-form [name=name]');
            if (!name.value)
                name.value =
                    { water: '喝水记录', exercise: '每日运动', clean: '房间清洁' }[
                        event.target.value
                    ] || '';
            this.editor.item.kind = event.target.value;
            if (!this.editor.item.icon)
                document.querySelector('#health-icon-preview').innerHTML = symbol(
                    event.target.value,
                );
        });
    }
    foodEditor(item = null, kind = 'delivery') {
        item = clone(item || { id: uid(), kind, name: '', rating: 0, description: '', notes: '' });
        this.dialog(
            'food',
            item.name ? '编辑转盘内容' : '添加转盘内容',
            `${field('名称 *', 'name', item.name, 'text', 'required maxlength="100"')}${field('评分（0—5）', 'rating', item.rating, 'number', 'min="0" max="5" step="0.5"')}<label class="field"><span>描述（选填）</span><textarea name="description">${esc(item.description)}</textarea></label><label class="field"><span>备注（选填）</span><textarea name="notes">${esc(item.notes)}</textarea></label>`,
            item,
            this.data.foodEntries.some((value) => value.id === item.id)
                ? button('删除', 'food-delete', `data-id="${item.id}"`, 'danger left')
                : '',
        );
    }
    async submit(form) {
        if (!form.reportValidity()) return;
        const fields = new FormData(form),
            value = (name) => String(fields.get(name) || '').trim();
        if (form.id === 'life-quick-form' || form.id === 'todo-quick-form') {
            const title = value('title');
            if (!title) throw Error('名称不能为空。');
            await this.commit((data) =>
                form.id === 'life-quick-form'
                    ? data.lifeEvents.push({
                          id: uid(),
                          title,
                          category: '',
                          start: '',
                          end: '',
                          content: '',
                          notes: '',
                          done: false,
                      })
                    : data.todoItems.push({ id: uid(), title, done: false }),
            );
            this.ctx.render();
            return;
        }
        const { kind, item } = this.editor;
        let record = { ...item },
            collection = '';
        if (kind === 'folder') {
            record.name = value('name');
            collection = 'portfolioFolders';
            if (!record.name) throw Error('文件夹名称不能为空。');
        }
        if (kind === 'event') {
            for (const key of ['title', 'category', 'start', 'end', 'content', 'notes'])
                record[key] = value(key);
            record.done = fields.get('done') === 'on';
            collection = 'lifeEvents';
            if (!record.title) throw Error('事件名称不能为空。');
            if (record.start && record.end && record.start > record.end)
                throw Error('结束时间不能早于开始时间。');
        }
        if (kind === 'health') {
            Object.assign(record, {
                name: value('name'),
                kind: value('kind'),
                unit: value('unit'),
                step: Number(value('step')),
            });
            collection = 'healthWidgets';
            if (!record.name) throw Error('组件名称不能为空。');
        }
        if (kind === 'food') {
            Object.assign(record, {
                name: value('name'),
                rating: Number(value('rating')),
                description: value('description'),
                notes: value('notes'),
            });
            collection = 'foodEntries';
            if (!record.name) throw Error('名称不能为空。');
        }
        if (kind === 'todo') {
            record.title = value('title');
            collection = 'todoItems';
            if (!record.title) throw Error('名称不能为空。');
        }
        if (kind === 'cover') {
            Object.assign(record, { title: value('title'), color: value('color') });
            await this.commit((data) => (data.portfolioCover = record));
        } else if (kind === 'rush') {
            await this.commit((data) => {
                data.rushStyles ??= {};
                data.rushStyles[String(item.hours)] = value('color');
            });
        } else if (collection)
            await this.commit((data) => {
                const index = data[collection].findIndex((entry) => entry.id === record.id);
                index < 0 ? data[collection].push(record) : (data[collection][index] = record);
            });
        this.ctx.close();
        this.editor = null;
        this.ctx.render();
    }
    async addImages(files) {
        if (files.length > 20) this.ctx.toast('每次最多加入20张图片，其余图片请分次加入。');
        const images = await this.ctx.readImages(files);
        if (!images.length) return;
        const folder = this.folder,
            previous = this.data.portfolioImages.filter(
                (item) => (item.folder || '') === folder,
            ).length;
        await this.commit((data) =>
            data.portfolioImages.push(
                ...images.map((image) => ({
                    id: uid(),
                    folder,
                    name: image.name,
                    src: image.src,
                    addedAt: new Date().toISOString(),
                })),
            ),
        );
        this.albumPage = previous + 1;
        this.ctx.render();
    }
    async spin(kind) {
        if (this.spinning.has(kind)) return;
        const entries = this.data.foodEntries.filter((item) => item.kind === kind);
        if (!entries.length) throw Error('请先添加转盘内容。');
        this.spinning.add(kind);
        this.ctx.render();
        const random = crypto.getRandomValues(new Uint32Array(1))[0],
            winner = entries[random % entries.length];
        const reel = document.querySelector(`[data-slot="${kind}"]`),
            wheel = document.querySelector(`[data-wheel="${kind}"]`);
        if (wheel)
            wheel.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(1080deg)' }], {
                duration: 2100,
                easing: 'cubic-bezier(.2,.7,.15,1)',
                fill: 'forwards',
            });
        if (reel) {
            reel.innerHTML = Array.from(
                { length: 25 },
                (_, i) =>
                    `<div class="slot-option">${esc(i === 24 ? winner.name : entries[i % entries.length].name)}</div>`,
            ).join('');
            reel.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1728px)' }], {
                duration: 2100,
                easing: 'cubic-bezier(.15,.75,.25,1)',
                fill: 'forwards',
            });
        }
        try {
            await new Promise((resolve) => setTimeout(resolve, 2150));
            await this.commit((data) => {
                data.foodLastChoices ??= {};
                data.foodLastChoices[kind] = winner.id;
            });
            this.foodResults[kind] = winner.id;
        } finally {
            this.spinning.delete(kind);
            this.ctx.render();
        }
    }
    async action(action, target) {
        const id = target.dataset.id;
        if (action === 'dialog-close') {
            this.ctx.close();
            this.editor = null;
            return;
        }
        if (action === 'rush-use') {
            this.ctx.rush(Number(target.dataset.hours));
            return;
        }
        if (action === 'rush-style') {
            const hours = Number(target.dataset.hours);
            this.dialog(
                'rush',
                `${hours}h 模板颜色`,
                field('模板颜色', 'color', rushColor(this.data, hours), 'color'),
                { hours },
            );
            return;
        }
        if (action === 'folder-open') {
            this.folder = id || '';
            this.albumPage = 1;
            this.selection.clear();
            this.ctx.render();
            return;
        }
        if (action === 'folder-new' || action === 'folder-rename') {
            const item = this.data.portfolioFolders.find((value) => value.id === id) || {
                id: uid(),
                name: '',
                parent: this.folder,
            };
            this.dialog(
                'folder',
                action === 'folder-new' ? '新建作品文件夹' : '修改文件夹名称',
                field('文件夹名称 *', 'name', item.name, 'text', 'required maxlength="100"'),
                item,
            );
            return;
        }
        if (action === 'folder-delete') {
            const item = this.data.portfolioFolders.find((value) => value.id === id);
            await this.confirm(
                '删除文件夹？',
                '文件夹中的图片和子文件夹会移到上层，图片不会删除。',
                (data) => {
                    data.portfolioImages.forEach((image) => {
                        if (image.folder === id) image.folder = item.parent || '';
                    });
                    data.portfolioFolders.forEach((folder) => {
                        if (folder.parent === id) folder.parent = item.parent || '';
                    });
                    data.portfolioFolders = data.portfolioFolders.filter(
                        (folder) => folder.id !== id,
                    );
                },
            );
            return;
        }
        if (action === 'portfolio-upload') {
            this.ctx.upload((files) => this.addImages(files), true);
            return;
        }
        if (action === 'album-page') {
            this.albumPage = Number(target.dataset.index);
            this.ctx.render();
            return;
        }
        if (action === 'album-prev' || action === 'album-next') {
            this.albumPage += action === 'album-prev' ? -1 : 1;
            this.ctx.render();
            return;
        }
        if (action === 'portfolio-select') {
            if (this.selection.size) this.selection.clear();
            else
                this.data.portfolioImages
                    .filter((item) => (item.folder || '') === this.folder)
                    .forEach((item) => this.selection.add(item.id));
            this.ctx.render();
            return;
        }
        if (action === 'portfolio-delete') {
            await this.confirm(
                '删除选中图片？',
                '将从作品展示中移除选中的图片，稿件参考图不受影响。',
                (data) => {
                    data.portfolioImages = data.portfolioImages.filter(
                        (item) => !this.selection.has(item.id),
                    );
                    this.selection.clear();
                },
            );
            return;
        }
        if (action === 'portfolio-move') {
            const folder = document.querySelector('#portfolio-move-target').value;
            await this.commit((data) =>
                data.portfolioImages.forEach((item) => {
                    if (this.selection.has(item.id)) item.folder = folder;
                }),
            );
            this.selection.clear();
            this.ctx.render();
            return;
        }
        if (action === 'cover-edit') {
            const item = this.data.portfolioCover || { title: '', color: '#242424', image: '' };
            this.dialog(
                'cover',
                '封面设置',
                `${field('封面文字（选填）', 'title', item.title, 'text', 'maxlength="100"')}${field('封面颜色', 'color', item.color, 'color')}<div id="cover-image-preview">${item.image ? `<img src="${esc(item.image)}" alt="封面" class="cover-image-preview">` : ''}</div>${button('上传封面图', 'cover-image')}${button('移除封面图', 'cover-clear')}`,
                item,
            );
            return;
        }
        if (action === 'cover-image' || action === 'health-icon') {
            this.ctx.upload(async (files) => {
                const image = (await this.ctx.readImages(files))[0];
                if (!image) return;
                this.editor.item[action === 'cover-image' ? 'image' : 'icon'] = image.src;
                document.querySelector(
                    action === 'cover-image' ? '#cover-image-preview' : '#health-icon-preview',
                ).innerHTML =
                    `<img class="cover-image-preview" src="${esc(image.src)}" alt="上传图片">`;
            }, false);
            return;
        }
        if (action === 'cover-clear' || action === 'health-icon-clear') {
            this.editor.item[action === 'cover-clear' ? 'image' : 'icon'] = '';
            document.querySelector(
                action === 'cover-clear' ? '#cover-image-preview' : '#health-icon-preview',
            ).innerHTML = action === 'cover-clear' ? '' : symbol(this.editor.item.kind);
            return;
        }
        if (action === 'life-tab') {
            this.lifeTab = target.dataset.tab;
            this.eventsFull = false;
            this.ctx.render();
            return;
        }
        if (action === 'life-month') {
            this.lifeMonth = new Date(
                this.lifeMonth.getFullYear(),
                this.lifeMonth.getMonth() + Number(target.dataset.step),
                1,
            );
            this.ctx.render();
            return;
        }
        if (action === 'events-full' || action === 'events-back') {
            this.eventsFull = action === 'events-full';
            this.ctx.render();
            return;
        }
        if (action === 'event-new' || action === 'event-edit') {
            this.eventEditor(
                this.data.lifeEvents.find((item) => item.id === id),
                target.dataset.date || '',
            );
            return;
        }
        if (action === 'event-category-add') {
            const name = document.querySelector('#life-category-name').value.trim(),
                color = document.querySelector('#life-category-color').value;
            if (!name) throw Error('请填写事件类别。');
            let category = this.data.lifeCategories.find((item) => item.name === name);
            if (!category) {
                category = { id: uid(), name, color };
                await this.commit((data) => data.lifeCategories.push(category));
            }
            const select = document.querySelector('#workspace-form [name=category]');
            if (![...select.options].some((option) => option.value === category.id))
                select.add(new Option(category.name, category.id));
            select.value = category.id;
            document.querySelector('#life-category-name').value = '';
            return;
        }
        if (action === 'event-toggle') {
            await this.commit((data) => {
                const item = data.lifeEvents.find((item) => item.id === id);
                item.done = !item.done;
            });
            this.ctx.render();
            return;
        }
        if (action === 'event-delete') {
            await this.confirm(
                '删除事件？',
                '此操作只删除这条生活事件，不影响稿件。',
                (data) => (data.lifeEvents = data.lifeEvents.filter((item) => item.id !== id)),
            );
            return;
        }
        if (action === 'health-new' || action === 'health-edit') {
            this.healthEditor(this.data.healthWidgets.find((item) => item.id === id));
            return;
        }
        if (action === 'health-delete') {
            await this.confirm('删除健康组件？', '组件及其每日记录会一同移除。', (data) => {
                data.healthWidgets = data.healthWidgets.filter((item) => item.id !== id);
                data.healthLogs = data.healthLogs.filter((item) => item.widget !== id);
            });
            return;
        }
        if (action === 'health-toggle-controls') {
            const controls = document.querySelector(`[data-health-controls="${id}"]`);
            controls.hidden = !controls.hidden;
            return;
        }
        if (action === 'health-increase' || action === 'health-decrease') {
            await this.commit((data) => {
                const widget = data.healthWidgets.find((item) => item.id === id);
                let log = data.healthLogs.find(
                    (item) => item.widget === id && item.date === today(),
                );
                if (!log) {
                    log = { id: uid(), widget: id, date: today(), value: 0 };
                    data.healthLogs.push(log);
                }
                log.value = Math.max(
                    0,
                    Math.round(
                        (log.value + (action === 'health-increase' ? 1 : -1) * widget.step) * 100,
                    ) / 100,
                );
            });
            this.ctx.render();
            const controls = document.querySelector(`[data-health-controls="${id}"]`);
            if (controls) controls.hidden = false;
            return;
        }
        if (action === 'food-new' || action === 'food-edit') {
            this.foodEditor(
                this.data.foodEntries.find((item) => item.id === id),
                target.dataset.kind,
            );
            return;
        }
        if (action === 'food-list') {
            const kind = target.dataset.kind;
            this.foodLists.has(kind) ? this.foodLists.delete(kind) : this.foodLists.add(kind);
            this.ctx.render();
            return;
        }
        if (action === 'food-spin') {
            await this.spin(target.dataset.kind);
            return;
        }
        if (action === 'food-delete') {
            await this.confirm('删除转盘内容？', '仅移除这一项。', (data) => {
                data.foodEntries = data.foodEntries.filter((item) => item.id !== id);
                for (const kind of ['delivery', 'dish']) {
                    if (data.foodLastChoices?.[kind] === id) delete data.foodLastChoices[kind];
                    if (this.foodResults[kind] === id) delete this.foodResults[kind];
                }
            });
            return;
        }
        if (action === 'todo-toggle') {
            await this.commit((data) => {
                const item = data.todoItems.find((item) => item.id === id);
                item.done = !item.done;
            });
            this.ctx.render();
            return;
        }
        if (action === 'todo-edit') {
            const item = this.data.todoItems.find((item) => item.id === id);
            this.dialog(
                'todo',
                '编辑想做的事情',
                field('内容 *', 'title', item.title, 'text', 'required maxlength="300"'),
                item,
            );
            return;
        }
        if (action === 'todo-delete') {
            await this.confirm(
                '删除待办事项？',
                '仅移除这一条待办。',
                (data) => (data.todoItems = data.todoItems.filter((item) => item.id !== id)),
            );
            return;
        }
        if (action === 'date-open') {
            this.openDatePicker(target.dataset.field);
            return;
        }
        if (action === 'date-month') {
            this.datePicker.month = new Date(
                this.datePicker.month.getFullYear(),
                this.datePicker.month.getMonth() + Number(target.dataset.step),
                1,
            );
            this.drawDatePicker();
            return;
        }
        if (action === 'date-select') {
            const input = document.querySelector(`#order-form [name="${this.datePicker.field}"]`);
            input.value = target.dataset.date;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            this.closeDatePicker();
            return;
        }
        if (action === 'date-close') this.closeDatePicker();
    }
    enhanceOrderEditor() {
        for (const input of document.querySelectorAll(
            '#order-form input[type=date][name=start]:not(:disabled),#order-form input[type=date][name=due]:not(:disabled)',
        )) {
            input.addEventListener('click', (event) => {
                event.preventDefault();
                this.openDatePicker(input.name);
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.openDatePicker(input.name);
                }
            });
            input.insertAdjacentHTML(
                'afterend',
                button('查看排期', 'date-open', `data-field="${input.name}"`),
            );
        }
    }
    closeDatePicker() {
        document.querySelector('.schedule-date-popover')?.remove();
        this.datePicker = null;
    }
    openDatePicker(name) {
        const input = document.querySelector(`#order-form [name="${name}"]`);
        if (!input) return;
        const chosen = input.value || today(),
            month = new Date(chosen + 'T12:00:00');
        this.datePicker = {
            field: name,
            month: new Date(month.getFullYear(), month.getMonth(), 1),
        };
        this.drawDatePicker();
    }
    drawDatePicker() {
        document.querySelector('.schedule-date-popover')?.remove();
        const { field: name, month } = this.datePicker,
            input = document.querySelector(`#order-form [name="${name}"]`);
        if (!input) return;
        const start = new Date(month.getFullYear(), month.getMonth(), 1);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        const node = document.createElement('div');
        node.className = 'schedule-date-popover';
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-label', '选择日期与查看已有排期');
        node.innerHTML = `<div class="row between">${button('‹', 'date-month', 'data-step="-1"')}<strong>${monthTitle(month)}</strong>${button('›', 'date-month', 'data-step="1"')}${button('关闭', 'date-close')}</div><p>沿用主页排期样式：${this.data.scheduleView === 'range' ? '开始至截止' : '仅截止日'}</p><div class="date-picker-grid">${['一', '二', '三', '四', '五', '六', '日'].map((value) => `<span>周${value}</span>`).join('')}${Array.from(
            { length: 42 },
            (_, index) => {
                const date = new Date(start);
                date.setDate(date.getDate() + index);
                const key = dateKey(date),
                    orders = this.data.orders.filter((order) =>
                        this.data.scheduleView === 'range'
                            ? order.start <= key && key <= order.due
                            : order.due === key,
                    ),
                    events = this.data.lifeEvents.filter((item) => eventOnDay(item, key));
                return `<button type="button" data-ws="date-select" data-date="${key}" class="picker-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${input.value === key ? 'selected' : ''}" title="${esc([...orders.map((item) => item.title), ...events.map((item) => item.title)].join('、'))}"><span>${date.getDate()}</span><div class="picker-marks">${orders
                    .slice(0, 4)
                    .map(
                        (order) =>
                            `<i class="${this.data.scheduleView === 'range' ? 'range-mark' : ''}" style="background:${order.rushHours ? rushColor(this.data, order.rushHours) : this.data.platforms.find((item) => item.id === order.platform)?.color || '#888888'}"></i>`,
                    )
                    .join('')}${events
                    .slice(0, 2)
                    .map(
                        (item) =>
                            `<i style="background:${this.data.lifeCategories.find((category) => category.id === item.category)?.color || '#777777'}"></i>`,
                    )
                    .join('')}</div></button>`;
            },
        ).join('')}</div>`;
        document.querySelector('#modal-root .modal')?.append(node);
        const rect = input.getBoundingClientRect();
        node.style.left = Math.max(12, Math.min(rect.left, innerWidth - 390)) + 'px';
        node.style.top = Math.max(12, Math.min(rect.bottom + 5, innerHeight - 440)) + 'px';
    }
    dragStart(event) {
        const order = event.target.closest('[data-order-drag]');
        if (order) {
            event.stopPropagation();
            event.dataTransfer.setData(
                'application/x-lotus-order',
                JSON.stringify({ id: order.dataset.id, mode: order.dataset.orderDrag }),
            );
            event.dataTransfer.effectAllowed = 'move';
            return;
        }
        const image = event.target.closest('[data-portfolio-drag]');
        if (image) {
            event.dataTransfer.setData(
                'application/x-lotus-portfolio',
                image.dataset.portfolioDrag,
            );
            event.dataTransfer.effectAllowed = 'move';
        }
    }
    async drop(event) {
        const raw = event.dataTransfer.getData('application/x-lotus-order');
        if (raw) {
            let cell = event.target.closest('[data-schedule-date]');
            if (!cell) {
                const week = event.target.closest('.schedule-range-week');
                if (week)
                    cell = [...week.querySelectorAll('[data-schedule-date]')].find((node) => {
                        const box = node.getBoundingClientRect();
                        return event.clientX >= box.left && event.clientX <= box.right;
                    });
            }
            if (!cell) return;
            event.preventDefault();
            event.stopPropagation();
            const { id, mode } = JSON.parse(raw),
                date = cell.dataset.scheduleDate;
            const original = this.data.orders.find((item) => item.id === id);
            if (!original) throw Error('稿件已不存在，请刷新。');
            const changed = moveOrderDates(original, date, mode);
            await this.commit(
                (data) => (data.orders[data.orders.findIndex((item) => item.id === id)] = changed),
            );
            this.ctx.render();
            this.ctx.toast(
                mode === 'move' ? '开始与截止日期已同步平移' : '截止日期已更新，开始日期保留',
            );
            return;
        }
        const zone = event.target.closest('[data-portfolio-drop]');
        if (!zone) return;
        event.preventDefault();
        event.stopPropagation();
        const image = event.dataTransfer.getData('application/x-lotus-portfolio');
        if (image) {
            const folder = zone.dataset.portfolioDrop;
            await this.commit((data) =>
                data.portfolioImages.forEach((item) => {
                    if (item.id === image || this.selection.has(item.id)) item.folder = folder;
                }),
            );
            this.selection.clear();
            this.ctx.render();
        } else if (event.dataTransfer.files.length) {
            this.folder = zone.dataset.portfolioDrop;
            await this.addImages([...event.dataTransfer.files]);
        }
    }
}
