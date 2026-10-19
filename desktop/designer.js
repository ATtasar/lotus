import { fonts, bindings, applyTextPreset } from './design-model.js';
const escape = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const options = (items, selected) =>
  Object.entries(items)
    .map(
      ([key, label]) =>
        `<option value="${key}" ${key === selected ? 'selected' : ''}>${escape(Array.isArray(label) ? label[0] : label)}</option>`,
    )
    .join('');
const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
const num = (key, value, min, max) =>
  `<input type="number" data-design-prop="${key}" value="${value}" min="${min}" max="${max}" step="1">`;
function itemEditor(state, resolve, allowBindings = true) {
  const item = state.items[state.selected];
  if (!item) return '<p class="hint">点击画布或图层列表选择文字和图片，可拖动位置。</p>';
  return `<h3>所选图层：${escape(item.name)}</h3><div class="form-grid">${field('水平位置', num('x', Math.round(item.x), -8000, 8000))}${field('垂直位置', num('y', Math.round(item.y), -8000, 8000))}${field('旋转角度', num('rotation', item.rotation, -180, 180))}${item.kind === 'text' ? field('文字大小', num('size', item.size, 8, 300)) + field('文字区域宽度', num('width', Math.round(item.width), 20, 4000)) : field('缩放比例 / %', num('scale', item.scale, 1, 200))}</div>${item.kind === 'text' ? field('文字来源', `<select data-design-prop="binding">${options({ '': '自行填写', ...(allowBindings ? bindings : {}) }, item.binding || '')}</select>`) + field('文字内容', `<textarea data-design-prop="text" ${item.binding ? 'disabled' : ''} maxlength="30000">${escape(item.binding ? resolve(item.binding) : item.text)}</textarea>`) + `<div class="form-grid">${field('此处字体', `<select data-design-prop="font">${options({ '': '跟随画布', ...fonts }, item.font || '')}</select>`)}${field('此处文字颜色', `<input type="color" data-design-prop="color" value="${item.color || state.color}">`)}</div>` + field('文字对齐', `<select data-design-prop="align">${options({ left: '左对齐', center: '居中', right: '右对齐' }, item.align)}</select>`) : ''}<div class="row design-actions"><button class="btn small" data-design-action="front">移到顶层</button><button class="btn small" data-design-action="back">移到底层</button><button class="btn small danger" data-design-action="remove">删除图层</button></div>`;
}
function layers(state) {
  return (
    state.items
      .map(
        (item, i) =>
          `<div class="design-layer ${i === state.selected ? 'active' : ''}"><label title="勾选后显示"><input type="checkbox" data-design-visible="${i}" ${item.visible !== false ? 'checked' : ''} aria-label="显示${escape(item.name)}"></label><button data-design-select="${i}" class="design-layer-name">${escape(item.name)}</button></div>`,
      )
      .join('') || '<p class="hint">尚无图层。</p>'
  );
}
export function designerControls(state, resolve, kind) {
  return `<div id="design-controls"><h3>画布与样式</h3><div class="form-grid">${field('画布宽度', `<input type="number" data-design-global="width" value="${state.width}" min="200" max="4000">`)}${field('画布高度', `<input type="number" data-design-global="height" value="${state.height}" min="200" max="4000">`)}${field('默认字体', `<select data-design-global="font">${options(fonts, state.font)}</select>`)}${field('默认文字颜色', `<input type="color" data-design-global="color" value="${state.color}">`)}${field('底色', `<input type="color" data-design-global="bg" value="${state.bg}">`)}${field('卡面 / 小票样式', `<select data-design-global="style">${options({ classic: '标准', minimal: '简洁', border: '边框', ticket: '票券' }, state.style)}</select>`)}</div>${kind !== 'layout' ? field('文字排版类型', `<select data-design-global="preset">${options({ classic: '标准排版', centered: '居中排列', left: '左侧排列', right: '右侧排列' }, state.preset)}</select>`) : ''}<div class="row design-actions"><button class="btn small" data-design-action="background">上传底图</button>${state.backgroundImage ? '<button class="btn small" data-design-action="clear-background">移除底图</button>' : ''}<button class="btn small" data-design-action="add-image">添加图片</button><button class="btn small" data-design-action="add-text">添加文字</button></div><p class="hint">字体使用电脑现有字体。所有信息均可留空；勾选图层决定是否显示。选择文字来源可关联稿件或自行填写。</p><div class="divider"></div><h3>显示内容与图层</h3><div id="design-layers">${layers(state)}</div><div class="divider"></div><div id="design-item-editor">${itemEditor(state, resolve, kind !== 'layout')}</div></div>`;
}
const imageCache = new Map();
const interactions = new WeakMap();
async function image(src) {
  if (!src) return null;
  if (!imageCache.has(src))
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          imageCache.delete(src);
          reject(new Error('图片读取失败，请重新上传。'));
        };
        img.src = src;
      }),
    );
  return imageCache.get(src);
}
export async function addDesignImages(state, assets) {
  if (state.items.length + assets.length > 100) throw new Error('每份模板最多 100 个图层。');
  for (const asset of assets) {
    const img = await image(asset.src);
    state.items.push({
      kind: 'image',
      name: asset.name || '图片素材',
      src: asset.src,
      x: state.width / 2,
      y: state.height / 2,
      scale: Math.max(1, Math.min(200, Math.round(((state.width * 0.5) / img.naturalWidth) * 100))),
      rotation: 0,
      visible: true,
    });
  }
  state.selected = state.items.length - 1;
}
function lines(ctx, value, width) {
  const result = [];
  for (const paragraph of String(value).split('\n')) {
    let current = '';
    for (const char of paragraph) {
      if (current && ctx.measureText(current + char).width > width) {
        result.push(current);
        current = '';
      }
      current += char;
    }
    result.push(current);
  }
  return result;
}
export async function drawDesign(canvas, state, resolve, clean = false, isCurrent = () => true) {
  const [background, ...images] = await Promise.all([
    image(state.backgroundImage),
    ...state.items.map((item) => (item.kind === 'text' ? null : image(item.src))),
  ]);
  if (!isCurrent() || !canvas.isConnected) return;
  canvas.width = state.width;
  canvas.height = state.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, state.width, state.height);
  if (background) {
    const scale = Math.max(
      state.width / background.naturalWidth,
      state.height / background.naturalHeight,
    );
    ctx.drawImage(
      background,
      (state.width - background.naturalWidth * scale) / 2,
      (state.height - background.naturalHeight * scale) / 2,
      background.naturalWidth * scale,
      background.naturalHeight * scale,
    );
  }
  ctx.strokeStyle = state.color;
  ctx.lineWidth = 2;
  if (state.style === 'border') ctx.strokeRect(24, 24, state.width - 48, state.height - 48);
  if (state.style === 'classic') {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = state.color;
    ctx.fillRect(30, 30, state.width - 60, state.height * 0.17);
    ctx.restore();
  }
  if (state.style === 'ticket') {
    ctx.save();
    ctx.setLineDash([8, 8]);
    for (const y of [state.height * 0.22, state.height * 0.82]) {
      ctx.beginPath();
      ctx.moveTo(25, y);
      ctx.lineTo(state.width - 25, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  const bounds = [];
  state.items.forEach((item, i) => {
    if (item.visible === false) {
      bounds[i] = null;
      return;
    }
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate((item.rotation * Math.PI) / 180);
    let width, height;
    if (item.kind === 'text') {
      ctx.font = `${item.size}px ${fonts[item.font || state.font]?.[1] || fonts.sans[1]}`;
      const value = item.binding ? resolve(item.binding) : item.text;
      const wrapped = lines(ctx, value, item.width);
      width = item.width;
      height = Math.max(item.size * 1.4, wrapped.length * item.size * 1.4);
      ctx.textBaseline = 'top';
      ctx.textAlign = item.align;
      ctx.fillStyle = item.color || state.color;
      const x = item.align === 'left' ? -width / 2 : item.align === 'right' ? width / 2 : 0;
      wrapped.forEach((line, index) =>
        ctx.fillText(line, x, -height / 2 + index * item.size * 1.4),
      );
    } else {
      const img = images[i];
      width = (img.naturalWidth * item.scale) / 100;
      height = (img.naturalHeight * item.scale) / 100;
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    }
    bounds[i] = { width, height };
    if (state.selected === i && !clean) {
      ctx.strokeStyle = '#777777';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6);
    }
    ctx.restore();
  });
  return bounds;
}
export function bindDesigner(
  canvas,
  state,
  resolve,
  bounds,
  { kind, redraw, render, upload, notify, changed = () => {} },
) {
  const controls = document.querySelector('#design-controls');
  if (!controls) return;
  const refresh = () => {
    document.querySelector('#design-item-editor').innerHTML = itemEditor(
      state,
      resolve,
      kind !== 'layout',
    );
    document.querySelector('#design-layers').innerHTML = layers(state);
  };
  const update = (event) => {
    const el = event.target;
    const global = el.dataset.designGlobal,
      prop = el.dataset.designProp;
    if (global) {
      if (['width', 'height'].includes(global)) {
        const n = Math.round(Number(el.value));
        if (!Number.isFinite(n) || n < 200 || n > 4000) return;
        state[global] = n;
      } else if (global === 'preset') applyTextPreset(state, el.value);
      else state[global] = el.value;
    } else if (prop) {
      const item = state.items[state.selected];
      if (!item) return;
      if (['x', 'y', 'rotation', 'scale', 'size', 'width'].includes(prop)) {
        const n = Number(el.value),
          min = Number(el.min),
          max = Number(el.max);
        if (!Number.isFinite(n) || n < min || n > max) return;
        item[prop] = n;
      } else if (prop === 'binding') {
        if (!el.value && item.binding) item.text = resolve(item.binding);
        item.binding = el.value;
        refresh();
      } else item[prop] = el.value;
    } else if (el.dataset.designVisible !== undefined) {
      state.items[Number(el.dataset.designVisible)].visible = el.checked;
    } else return;
    changed();
    redraw();
  };
  controls.oninput = update;
  controls.onchange = update;
  controls.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    event.preventDefault();
    try {
      if (button.dataset.designSelect !== undefined) {
        state.selected = Number(button.dataset.designSelect);
        refresh();
        redraw();
        return;
      }
      const action = button.dataset.designAction;
      if (action === 'background')
        upload(async (assets) => {
          state.backgroundImage = assets[0]?.src || '';
          changed();
          render();
        }, false);
      if (action === 'clear-background') {
        state.backgroundImage = '';
        changed();
        render();
      }
      if (action === 'add-image')
        upload(async (assets) => {
          await addDesignImages(state, assets);
          changed();
          render();
        }, true);
      if (action === 'add-text') {
        changed();
        if (state.items.length >= 100) throw new Error('每份模板最多 100 个图层。');
        state.items.push({
          kind: 'text',
          name: '自定义文字',
          binding: '',
          text: '',
          x: state.width / 2,
          y: state.height / 2,
          width: state.width * 0.7,
          size: 28,
          align: 'left',
          rotation: 0,
          visible: true,
        });
        state.selected = state.items.length - 1;
        refresh();
        redraw();
      }
      if (action === 'remove' && state.selected >= 0) {
        changed();
        state.items.splice(state.selected, 1);
        state.selected = -1;
        refresh();
        redraw();
      }
      if (['front', 'back'].includes(action) && state.selected >= 0) {
        changed();
        const item = state.items.splice(state.selected, 1)[0];
        if (action === 'front') {
          state.items.push(item);
          state.selected = state.items.length - 1;
        } else {
          state.items.unshift(item);
          state.selected = 0;
        }
        refresh();
        redraw();
      }
    } catch (error) {
      notify(error.message);
    }
  };
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const interaction = interactions.get(canvas) || {};
  if (bounds) interaction.bounds = bounds;
  interactions.set(canvas, interaction);
  canvas.onpointerdown = (event) => {
    event.preventDefault();
    const p = point(event);
    let found = -1;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i],
        box = interaction.bounds?.[i];
      if (!box) continue;
      const angle = (-item.rotation * Math.PI) / 180,
        dx = p.x - item.x,
        dy = p.y - item.y;
      if (
        Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= box.width / 2 &&
        Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= box.height / 2
      ) {
        found = i;
        break;
      }
    }
    state.selected = found;
    refresh();
    if (found >= 0) {
      interaction.dragging = {
        x: p.x,
        y: p.y,
        startX: state.items[found].x,
        startY: state.items[found].y,
      };
      canvas.setPointerCapture(event.pointerId);
    } else interaction.dragging = undefined;
    canvas.focus();
    redraw();
  };
  canvas.onpointermove = (event) => {
    const dragging = interaction.dragging;
    if (!dragging || state.selected < 0) return;
    const p = point(event),
      item = state.items[state.selected];
    item.x = Math.max(-8000, Math.min(8000, dragging.startX + p.x - dragging.x));
    item.y = Math.max(-8000, Math.min(8000, dragging.startY + p.y - dragging.y));
    changed();
    redraw();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    interaction.dragging = undefined;
    refresh();
  };
  canvas.onkeydown = (event) => {
    const item = state.items[state.selected];
    if (!item) return;
    if (
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(
        event.key,
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    changed();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      state.items.splice(state.selected, 1);
      state.selected = -1;
    } else {
      const delta = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowLeft') item.x -= delta;
      if (event.key === 'ArrowRight') item.x += delta;
      if (event.key === 'ArrowUp') item.y -= delta;
      if (event.key === 'ArrowDown') item.y += delta;
      item.x = Math.max(-8000, Math.min(8000, item.x));
      item.y = Math.max(-8000, Math.min(8000, item.y));
    }
    refresh();
    redraw();
  };
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
}
