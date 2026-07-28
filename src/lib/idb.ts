// IndexedDB 统一数据存取层
// 原生 API 封装，0 依赖。提供 Promise 化的 CRUD + zustand persist 适配器 + 一次性数据迁移。

const DB_NAME = "signaltv-db";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const MIGRATION_KEY = "__idb_migrated__";
const LEGACY_LS_KEY = "signaltv-iptv";

// 缓存已打开的数据库实例，避免每次操作都重新建立连接
let dbPromise: Promise<IDBDatabase> | null = null;

/** 打开（必要时升级）数据库，确保 `kv` object store 存在。 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); // keyPath 留空 → 使用 out-of-line keys
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 连接失效自恢复：浏览器存储清理强制关闭（close）或其他标签页
      // 升版（versionchange）时，缓存的实例已死，若不置空 dbPromise，
      // 后续所有 IDB 操作会永久失败直到刷新
      db.onclose = () => {
        if (dbPromise === p) dbPromise = null;
      };
      db.onversionchange = () => {
        // 主动关闭旧连接，避免未来升级 DB_VERSION 时旧标签页永久 block 新标签页
        db.close();
        if (dbPromise === p) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("打开 IndexedDB 失败"));
  });
  dbPromise = p;
  // 打开失败时重置缓存：否则被拒绝的 Promise 永久缓存，
  // 后续所有 IDB 操作永远失败（如浏览器临时拒绝后无法恢复）
  p.catch(() => {
    if (dbPromise === p) dbPromise = null;
  });
  return p;
}

/** 在读写事务中执行单个 store 操作，包装为 Promise。
 * 写事务以 tx.oncomplete 为准：put 的 success 事件先于事务 commit，
 * commit 阶段失败（配额满等）时若已 resolve 会造成写入静默丢失。 */
function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        if (mode === "readonly") {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error("IndexedDB 操作失败"));
        } else {
          tx.oncomplete = () => resolve(req.result);
          tx.onabort = () =>
            reject(tx.error ?? req.error ?? new Error("IndexedDB 事务中断"));
          tx.onerror = () =>
            reject(tx.error ?? req.error ?? new Error("IndexedDB 操作失败"));
        }
      }),
  );
}

/** 读取 key 对应的字符串值；不存在时返回 undefined。 */
export async function idbGet(key: string): Promise<string | undefined> {
  const result = await withStore<string | undefined>("readonly", (store) =>
    store.get(key) as IDBRequest<string | undefined>,
  );
  return result ?? undefined;
}

/** 写入 key/value（value 必须是字符串，与 zustand persist 序列化格式一致）。 */
export async function idbSet(key: string, value: string): Promise<void> {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(value, key));
}

/** 删除指定 key；key 不存在时静默成功。 */
export async function idbDel(key: string): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(key));
}

/**
 * 一次性数据迁移：将旧版 localStorage（key=`signaltv-iptv`）数据迁移到 IndexedDB。
 * 迁移成功后删除旧 localStorage key，并通过 IndexedDB 内置标记避免重复迁移。
 * 任何异常都不阻塞启动（最坏情况从空状态开始）。
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // 已迁移过 → 直接返回
    const migrated = await idbGet(MIGRATION_KEY);
    if (migrated) return;

    const oldRaw = window.localStorage.getItem(LEGACY_LS_KEY);
    if (oldRaw) {
      // 旧数据原样写入 IndexedDB（格式与 zustand persist 默认一致）
      await idbSet(LEGACY_LS_KEY, oldRaw);
    }
    // 无论是否有旧数据都打上迁移标记，避免每次启动都查 localStorage
    await idbSet(MIGRATION_KEY, "1");
    // 清理旧 localStorage
    window.localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    // 迁移失败不阻塞应用启动
  }
}

/**
 * zustand persist 中间件的 IndexedDB 适配器。
 * `getItem` 返回 null（而非 undefined）以符合 zustand StateStorage 约定。
 */
export const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const v = await idbGet(name);
    return v ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await idbSet(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await idbDel(name);
  },
};
