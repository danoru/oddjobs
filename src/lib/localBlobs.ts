/**
 * A tiny IndexedDB store for blobs that must stay on this device (a player's
 * final recording). localStorage can't hold audio. Every call fails soft:
 * private windows and blocked storage just mean nothing is remembered.
 */

const DB = "tearoff";
const STORE = "blobs";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export type StoredBlob = { blob: Blob; mime: string; savedAt: number };

export const getBlob = (key: string) => tx<StoredBlob | undefined>("readonly", (s) => s.get(key)).then((v) => v ?? null);
export const putBlob = (key: string, value: StoredBlob) => tx("readwrite", (s) => s.put(value, key)).then(() => undefined);
export const deleteBlob = (key: string) => tx("readwrite", (s) => s.delete(key)).then(() => undefined);
