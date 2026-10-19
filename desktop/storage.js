// Desktop uses the PC service. Browser storage is read solely for a
// confirmed migration; it is never the primary data store.
import { validateBackup } from './model.js';
import { request, connect, localAccess } from './api.js';
let revision;
let blocked = false;
export const storage = {
  localAccess,
  version: () => revision,
  remoteRevision: async () => (await request('revision')).revision,
  readRemote: () => request('desktop-workspace'),
  acceptRemote(snapshot) {
    const data = validateBackup(snapshot.data);
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < revision)
      throw new Error('读取到旧版本，已取消覆盖。');
    revision = snapshot.revision;
    return data;
  },
  info: () => request('info'),
  async load() {
    await connect(true);
    const result = await request('desktop-workspace');
    if (!Number.isSafeInteger(result.revision) || result.revision < 0)
      throw new Error('数据库版本响应无效，已停止载入。');
    revision = result.revision;
    return validateBackup(result.data);
  },
  async save(data) {
    if (blocked) throw new Error('前次保存失败。请先导出备份，再刷新页面；不会覆盖磁盘记录。');
    try {
      const result = await request('desktop-workspace', { data, baseRevision: revision });
      if (!Number.isSafeInteger(result.revision) || result.revision !== revision + 1)
        throw new Error('保存响应未确认写入数据库。请保留页面并导出备份，不会显示保存成功。');
      revision = result.revision;
    } catch (error) {
      blocked = true;
      throw error;
    }
  },
  async backup() {
    return (await request('backup', {})).path;
  },
  async legacy() {
    // databases() avoids creating empty legacy databases on every launch.
    if (indexedDB.databases) {
      const names = await indexedDB.databases();
      if (names.some((db) => db.name === 'still-commission-workbench-blank-v1')) {
        const value = await new Promise((resolve, reject) => {
          const open = indexedDB.open('still-commission-workbench-blank-v1');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('state')) {
              db.close();
              resolve(null);
              return;
            }
            const read = db.transaction('state').objectStore('state').get('workspace');
            read.onsuccess = () => {
              db.close();
              resolve(read.result || null);
            };
            read.onerror = () => {
              db.close();
              reject(read.error);
            };
          };
        });
        if (value) return validateBackup(value);
      }
    }
    const text = localStorage.getItem('still-workbench-blank-v1');
    return text ? validateBackup(JSON.parse(text)) : null;
  },
};
