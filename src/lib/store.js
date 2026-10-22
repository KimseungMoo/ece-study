const DB_NAME = 'ece-study';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('attempts')) {
        const s = db.createObjectStore('attempts', { keyPath: 'id' });
        s.createIndex('byQuestion', 'questionId');
        s.createIndex('byAt', 'at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function kvGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key, value) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  await txDone(tx);
}

export async function kvDel(key) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').delete(key);
  await txDone(tx);
}

export async function addAttempt(attempt) {
  const db = await openDb();
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').put(attempt);
  await txDone(tx);
}

export async function allAttempts() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('attempts').objectStore('attempts').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAttempts() {
  const db = await openDb();
  const tx = db.transaction('attempts', 'readwrite');
  tx.objectStore('attempts').clear();
  await txDone(tx);
}

export function newAttempt(partial) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    at: Date.now(),
    result: 'wrong',
    mode: 'year',
    ...partial,
  };
}

export async function loadProgressMeta() {
  const [memos, mastered, settings] = await Promise.all([
    kvGet('memos'),
    kvGet('mastered'),
    kvGet('settings'),
  ]);
  return {
    memos: memos || {},
    mastered: mastered || {},
    settings: {
      theme: 'system',
      immediate: false,
      timer: false,
      remember: false,
      ...(settings || {}),
    },
  };
}

export async function saveMemos(memos) {
  await kvSet('memos', memos);
}

export async function saveMastered(mastered) {
  await kvSet('mastered', mastered);
}

export async function saveSettings(settings) {
  await kvSet('settings', settings);
}

export async function saveRememberedKey(key, builtAt) {
  await kvSet('cryptoKey', { key, builtAt });
}

export async function loadRememberedKey() {
  return (await kvGet('cryptoKey')) || null;
}

export async function clearRememberedKey() {
  await kvDel('cryptoKey');
}

export async function exportBackup() {
  const [attempts, memos, mastered, settings] = await Promise.all([
    allAttempts(),
    kvGet('memos'),
    kvGet('mastered'),
    kvGet('settings'),
  ]);
  return {
    version: 1,
    app: 'ece-study',
    exported_at: new Date().toISOString(),
    attempts: attempts || [],
    memos: memos || {},
    mastered: mastered || {},
    settings: settings || {},
  };
}

export async function importBackup(payload) {
  if (!payload || payload.app !== 'ece-study') throw new Error('이 앱의 백업 파일이 아닙니다');
  const db = await openDb();
  const tx = db.transaction(['attempts', 'kv'], 'readwrite');
  tx.objectStore('attempts').clear();
  for (const a of payload.attempts || []) tx.objectStore('attempts').put(a);
  const kv = tx.objectStore('kv');
  kv.put(payload.memos || {}, 'memos');
  kv.put(payload.mastered || {}, 'mastered');
  if (payload.settings) kv.put(payload.settings, 'settings');
  await txDone(tx);
}
