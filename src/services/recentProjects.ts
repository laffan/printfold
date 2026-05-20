/**
 * RecentProjects Service
 *
 * Tracks recently opened projects so they can be re-opened from the
 * welcome screen.
 *
 * Electron: list of file paths persisted via IPC in app userData.
 * Web: FileSystemFileHandles persisted in IndexedDB, with display
 * metadata (name, lastOpened) mirrored in localStorage.
 */

const LS_KEY = 'printfold.recents.v1';
const DB_NAME = 'printfold-recents';
const DB_STORE = 'handles';
const MAX_RECENTS = 10;

export interface RecentEntry {
  id: string;
  name: string;
  lastOpened: number;
  /** Electron-only: absolute path on disk. */
  path?: string;
  /** True on web when a saved FileSystemFileHandle is available. */
  hasHandle?: boolean;
}

const isElectron = (): boolean => Boolean(window.electronAPI?.isElectron);

// -------------------------------------------------------------------------
// IndexedDB helpers (web only)
// -------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(id: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbGet(id: string): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// -------------------------------------------------------------------------
// Web list (localStorage metadata mirror)
// -------------------------------------------------------------------------

function readWebList(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWebList(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // Quota or disabled storage — best-effort only.
  }
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

export const recentProjects = {
  async list(): Promise<RecentEntry[]> {
    if (isElectron()) {
      const api = window.electronAPI;
      const entries = (await api?.getRecents?.()) || [];
      return entries.sort((a, b) => b.lastOpened - a.lastOpened);
    }
    return readWebList().sort((a, b) => b.lastOpened - a.lastOpened);
  },

  async addElectronPath(path: string, name: string): Promise<void> {
    const api = window.electronAPI;
    if (!api?.addRecent) return;
    await api.addRecent({ path, name, lastOpened: Date.now() });
  },

  async addWebHandle(handle: FileSystemFileHandle, name: string): Promise<string> {
    const id = crypto.randomUUID();
    await dbPut(id, handle);
    const list = readWebList().filter(e => e.name !== name);
    list.unshift({ id, name, lastOpened: Date.now(), hasHandle: true });
    writeWebList(list.slice(0, MAX_RECENTS));
    return id;
  },

  async getWebHandle(id: string): Promise<FileSystemFileHandle | null> {
    return dbGet(id);
  },

  async touchWeb(id: string): Promise<void> {
    const list = readWebList();
    const entry = list.find(e => e.id === id);
    if (entry) {
      entry.lastOpened = Date.now();
      writeWebList(list);
    }
  },

  async remove(entry: RecentEntry): Promise<void> {
    if (isElectron()) {
      const api = window.electronAPI;
      if (entry.path && api?.removeRecent) {
        await api.removeRecent(entry.path);
      }
      return;
    }
    await dbDelete(entry.id);
    writeWebList(readWebList().filter(e => e.id !== entry.id));
  },
};
