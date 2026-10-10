/**
 * 本机持久化：IndexedDB 的薄封装。
 *
 * 数据只在这台机器的这个浏览器里 —— 换浏览器、清站点数据就没有了，这是本工具的
 * 既定形态，不是缺陷。为了不让 Safari 的 ITP 在七天不用后把库驱逐掉，启动时向
 * `navigator.storage.persist()` 申请持久化配额；申请被拒不影响使用，只是那份数据
 * 可能被系统回收。
 *
 * 三个 store：`classes`（班）、`sessions`（一场记录）、`settings`（全局偏好）。
 * 进行中的会话也落盘，所以中途刷新或关掉浏览器，回来接着上一次那一相继续。
 */

const DB_NAME = 'study-hall';
const DB_VERSION = 1;
const STORE_CLASSES = 'classes';
const STORE_SESSIONS = 'sessions';
const STORE_SETTINGS = 'settings';

let dbPromise = null;

/** 打开（并按需建）库。同一个页面里只开一次。 */
export function openDb() {
  if (dbPromise !== null) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CLASSES)) {
        db.createObjectStore(STORE_CLASSES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('classId', 'classId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打不开本机数据库'));
  });
  return dbPromise;
}

/** 申请持久化配额。失败不抛：拿不到配额照样能用，只是数据可能被回收。 */
export async function requestPersistence() {
  if (typeof navigator.storage?.persist !== 'function') {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** 把一个 request 包成 Promise。 */
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机读写失败'));
  });
}

/** 在一个事务里跑一段逻辑，跑完才结算。 */
async function transact(storeNames, mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('本机事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('本机事务被中止'));
    Promise.resolve(run(tx)).then(
      (value) => {
        result = value;
      },
      (error) => {
        reject(error);
        try {
          tx.abort();
        } catch {
          /* 事务已经结算了，不用再中止 */
        }
      },
    );
  });
}

/* ---------- 班 ---------- */

export async function listClasses() {
  return transact([STORE_CLASSES], 'readonly', async (tx) => {
    const all = await wrap(tx.objectStore(STORE_CLASSES).getAll());
    return all.sort((left, right) => left.createdAt - right.createdAt);
  });
}

export async function getClass(id) {
  return transact([STORE_CLASSES], 'readonly', async (tx) => {
    const found = await wrap(tx.objectStore(STORE_CLASSES).get(id));
    return found ?? null;
  });
}

export async function putClass(klass) {
  await transact([STORE_CLASSES], 'readwrite', async (tx) => {
    await wrap(tx.objectStore(STORE_CLASSES).put(klass));
  });
}

export async function deleteClass(id) {
  await transact([STORE_CLASSES, STORE_SESSIONS], 'readwrite', async (tx) => {
    tx.objectStore(STORE_CLASSES).delete(id);
    const index = tx.objectStore(STORE_SESSIONS).index('classId');
    const keys = await wrap(index.getAllKeys(id));
    const sessions = tx.objectStore(STORE_SESSIONS);
    for (const key of keys) {
      sessions.delete(key);
    }
  });
}

/* ---------- 一场记录 ---------- */

export async function listSessions(classId) {
  return transact([STORE_SESSIONS], 'readonly', async (tx) => {
    const store = tx.objectStore(STORE_SESSIONS);
    const found = await wrap(
      classId === undefined ? store.getAll() : store.index('classId').getAll(classId),
    );
    return found.sort((left, right) => left.startedAt - right.startedAt);
  });
}

export async function getSession(id) {
  return transact([STORE_SESSIONS], 'readonly', async (tx) => {
    const found = await wrap(tx.objectStore(STORE_SESSIONS).get(id));
    return found ?? null;
  });
}

export async function putSession(session) {
  await transact([STORE_SESSIONS], 'readwrite', async (tx) => {
    await wrap(tx.objectStore(STORE_SESSIONS).put(session));
  });
}

export async function deleteSession(id) {
  await transact([STORE_SESSIONS], 'readwrite', async (tx) => {
    await wrap(tx.objectStore(STORE_SESSIONS).delete(id));
  });
}

/* ---------- 全局偏好 ---------- */

export async function getSetting(key, fallback) {
  return transact([STORE_SETTINGS], 'readonly', async (tx) => {
    const found = await wrap(tx.objectStore(STORE_SETTINGS).get(key));
    return found === undefined || found === null ? fallback : found.value;
  });
}

export async function putSetting(key, value) {
  await transact([STORE_SETTINGS], 'readwrite', async (tx) => {
    await wrap(tx.objectStore(STORE_SETTINGS).put({ key, value }));
  });
}
