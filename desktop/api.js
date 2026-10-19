// Same-origin HTTP client. No business records or credentials are written to
// localStorage/IndexedDB. Only the installed loopback service is used.
const config = window.LOTUS_CONFIG || {};
export const localAccess = config.localAccess ?? location.hostname === '127.0.0.1';
if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
  document.querySelector('#app').textContent =
    '请通过桌面“创作者工作台”快捷方式或 Start-Local.cmd 打开本机工作台。不要直接打开 HTML 文件。原数据保留。';
  throw new Error('需要本机 HTTP 服务。');
}
const base = new URL(config.apiBase || '/local-api/', location.origin);
if (base.origin !== location.origin) throw new Error('API 必须与当前电脑工作台同源。');
if (!base.pathname.endsWith('/')) base.pathname += '/';
let token, connecting;
async function raw(endpoint, body, withToken = true) {
  let response;
  try {
    response = await fetch(new URL(endpoint, base), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Lotus-Local': '1',
        ...(withToken && token ? { 'X-Lotus-Token': token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(
      error.name === 'TimeoutError'
        ? '连接电脑超时，修改尚未确认保存。请保留页面或导出备份。'
        : '无法连接电脑，修改尚未确认保存。请检查本机服务和日志。',
    );
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('电脑服务响应不正确，请运行最新版安装脚本后重试。');
  }
  return { response, value };
}
function failure(result) {
  return Object.assign(new Error(result.value.message || '电脑数据操作失败。'), {
    status: result.response.status,
  });
}
export async function connect(interactive = false) {
  if (connecting) return connecting;
  connecting = (async () => {
    let result = await raw('session', undefined, false);
    if (!result.response.ok) throw failure(result);
    if (typeof result.value.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.value.token))
      throw new Error('本机服务身份响应无效，请运行 Install-Local.cmd 修复安装。');
    token = result.value.token;
  })();
  try {
    await connecting;
  } finally {
    connecting = undefined;
  }
}
export async function request(endpoint, body) {
  if (!token) await connect(false);
  let result = await raw(endpoint, body);
  // A 403 CSRF/session rejection happens before any write. Refresh the session
  // once after a PC restart; never retry an ambiguous network failure.
  if (result.response.status === 403) {
    token = undefined;
    await connect(false);
    result = await raw(endpoint, body);
  }
  if (!result.response.ok) throw failure(result);
  return result.value;
}
