// Canvas template data only; shared by the browser and SQLite validation.
export const fonts = {
  sans: ['系统无衬线', '"Microsoft YaHei", "PingFang SC", sans-serif'],
  song: ['宋体', 'SimSun, "Songti SC", serif'],
  kai: ['楷体', 'KaiTi, STKaiti, serif'],
  hei: ['黑体', 'SimHei, "Microsoft YaHei", sans-serif'],
  mono: ['等宽字体', 'Consolas, "Courier New", monospace'],
};
export const bindings = {
  brand: '工作室 / 画师名称',
  subtitle: '凭证说明',
  customer: '单主名称',
  membership: '会员称呼',
  cardNumber: '卡号',
  itemText: '稿件内容',
  amount: '金额',
  date: '交付日期',
  handle: '平台账号 / 联系方式',
  message: '附加说明',
};
export function createDesign(kind, values = {}) {
  const card = kind === 'card',
    layout = kind === 'layout';
  const state = {
    version: 1,
    width: card ? 1080 : layout ? 1000 : 680,
    height: card ? 650 : layout ? 1000 : 1100,
    bg: values.accent || '#ffffff',
    backgroundImage: '',
    font: 'sans',
    color: '#222222',
    style: layout ? 'minimal' : 'classic',
    preset: 'classic',
    selected: -1,
    items: [],
  };
  if (layout) return state;
  const rows = card
    ? [
        ['brand', 64, 128, 40, 660],
        ['subtitle', 64, 190, 18, 660],
        ['membership', 64, 265, 20, 660],
        ['customer', 64, 345, 48, 660],
        ['cardNumber', 64, 407, 20, 660],
        ['message', 64, 480, 20, 660],
        ['handle', 64, 580, 17, 940],
      ]
    : [
        ['brand', 60, 105, 34, 560],
        ['subtitle', 60, 173, 20, 560],
        ['customer', 60, 292, 32, 560],
        ['date', 60, 355, 17, 560],
        ['itemText', 60, 475, 25, 560],
        ['amount', 60, 595, 30, 560],
        ['message', 60, 735, 21, 560],
        ['handle', 60, 990, 17, 560],
      ];
  state.items = rows.map(([binding, x, y, size, width]) => ({
    kind: 'text',
    name: bindings[binding],
    binding,
    text: '',
    x: x + width / 2,
    y,
    width,
    size,
    rotation: 0,
    align: card ? 'left' : 'center',
    visible: !['membership', 'cardNumber'].includes(binding) || !!values[binding],
  }));
  return state;
}
export function prepareDesign(value, kind = 'layout', values = {}) {
  const fallback = createDesign(kind, values);
  return {
    ...fallback,
    ...value,
    items: (value?.items || fallback.items).map((item) => ({ ...item })),
  };
}
export function applyTextPreset(state, preset) {
  state.preset = preset;
  const bound = state.items.filter((item) => item.kind === 'text' && item.binding);
  const defaults = createDesign(state.width > state.height ? 'card' : 'receipt');
  bound.forEach((item, i) => {
    const original = defaults.items.find((x) => x.binding === item.binding);
    if (preset === 'classic' && original) {
      item.x = (original.x * state.width) / defaults.width;
      item.y = (original.y * state.height) / defaults.height;
      item.width = (original.width * state.width) / defaults.width;
      item.align = original.align;
    } else {
      item.width = state.width * 0.82;
      item.x = state.width / 2;
      item.y = state.height * (0.12 + (i * 0.76) / Math.max(1, bound.length - 1));
      item.align = preset === 'centered' ? 'center' : preset === 'right' ? 'right' : 'left';
    }
  });
}
export function validateDesign(state, safeImage, fail) {
  const number = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const text = (x, max = 30000) => typeof x === 'string' && x.length <= max;
  const color = (x) => typeof x === 'string' && /^#[a-f0-9]{6}$/i.test(x);
  if (
    !state ||
    (state.version !== undefined && state.version !== 1) ||
    !number(state.width, 200, 4000) ||
    !number(state.height, 200, 4000) ||
    !color(state.bg) ||
    !Array.isArray(state.items) ||
    state.items.length > 10000
  )
    return fail('画布设置不正确');
  if (
    (state.backgroundImage && !safeImage(state.backgroundImage)) ||
    (state.font !== undefined && !Object.hasOwn(fonts, state.font)) ||
    (state.color !== undefined && !color(state.color)) ||
    (state.style !== undefined &&
      !['classic', 'minimal', 'border', 'ticket'].includes(state.style)) ||
    (state.preset !== undefined && !['classic', 'centered', 'left', 'right'].includes(state.preset))
  )
    return fail('画布外观不正确');
  for (const item of state.items) {
    if (
      !item ||
      !text(item.name) ||
      !number(item.x, -8000, 8000) ||
      !number(item.y, -8000, 8000) ||
      !number(item.rotation, -180, 180) ||
      (item.visible !== undefined && typeof item.visible !== 'boolean')
    )
      return fail('图层位置不正确');
    if (item.kind === 'text') {
      if (
        !text(item.text) ||
        (item.binding && !Object.hasOwn(bindings, item.binding)) ||
        !number(item.size, 8, 300) ||
        !number(item.width, 20, 4000) ||
        !['left', 'center', 'right'].includes(item.align) ||
        (item.font && !Object.hasOwn(fonts, item.font)) ||
        (item.color && !color(item.color))
      )
        return fail('文字图层不正确');
    } else if (
      (item.kind !== undefined && item.kind !== 'image') ||
      !safeImage(item.src) ||
      !number(item.scale, 1, 200)
    )
      return fail('图片图层不正确');
  }
}
