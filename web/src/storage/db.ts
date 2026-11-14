// Runs are kept in IndexedDB (localStorage tops out around 5 MB, a long history can be bigger).
// Each run is one record keyed by its id, so importing the same file twice just overwrites.

import type { Lifetime, Run } from "../model/schema";

/** Someone else's export, kept apart from your own runs. */
export interface Friend {
  name: string;
  runs: Run[];
  lifetime?: Lifetime;
  importedAt: string;
}

const DB_NAME = "isaac-run-history";
const STORE = "runs";
const LIFETIME = "lifetime"; // one record per save slot, keyed by slot
const FRIENDS = "friends"; // someone else's export to compare with, keyed by the name given to it
const HANDLES = "handles"; // the connected history folder (FileSystemDirectoryHandle), key "history"

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser has no IndexedDB, runs can't be kept between visits."));
        return;
      }
      const req = indexedDB.open(DB_NAME, 4);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(LIFETIME)) db.createObjectStore(LIFETIME, { keyPath: "slot" });
        if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
        if (!db.objectStoreNames.contains(FRIENDS)) db.createObjectStore(FRIENDS, { keyPath: "name" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Couldn't open the browser database."));
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadRuns(): Promise<Run[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Run[]);
    req.onerror = () => reject(req.error);
  });
}

/** Store runs; returns how many were new and how many replaced an existing run. */
export async function saveRuns(runs: Run[]): Promise<{ added: number; updated: number }> {
  const db = await open();
  const existing = new Set((await loadRuns()).map((r) => r.id));
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  let added = 0;
  let updated = 0;
  for (const r of runs) {
    if (existing.has(r.id)) updated++;
    else added++;
    store.put(r);
  }
  await done(tx);
  return { added, updated };
}

export async function deleteRun(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await done(tx);
}

export async function clearRuns(): Promise<void> {
  const db = await open();
  const tx = db.transaction([STORE, LIFETIME], "readwrite");
  tx.objectStore(STORE).clear();
  tx.objectStore(LIFETIME).clear();
  await done(tx);
}

export async function loadLifetimes(): Promise<Lifetime[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(LIFETIME, "readonly").objectStore(LIFETIME).getAll();
    req.onsuccess = () => resolve(req.result as Lifetime[]);
    req.onerror = () => reject(req.error);
  });
}

/** Keep the newer snapshot of a save slot (an older export doesn't overwrite a newer one). */
export async function saveLifetime(l: Lifetime): Promise<boolean> {
  const existing = (await loadLifetimes()).find((x) => x.slot === l.slot);
  if (existing?.takenAt && l.takenAt && existing.takenAt > l.takenAt) return false;
  const db = await open();
  const tx = db.transaction(LIFETIME, "readwrite");
  tx.objectStore(LIFETIME).put(l);
  await done(tx);
  return true;
}

/** The folder handle the user connected, or undefined. */
export async function loadHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(HANDLES, "readonly").objectStore(HANDLES).get("history");
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Remember (or with undefined, forget) the connected history folder. */
export async function saveHandle(handle: FileSystemDirectoryHandle | undefined): Promise<void> {
  const db = await open();
  const tx = db.transaction(HANDLES, "readwrite");
  if (handle) tx.objectStore(HANDLES).put(handle, "history");
  else tx.objectStore(HANDLES).delete("history");
  await done(tx);
}

export async function loadFriends(): Promise<Friend[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FRIENDS, "readonly").objectStore(FRIENDS).getAll();
    req.onsuccess = () => resolve(req.result as Friend[]);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFriend(f: Friend): Promise<void> {
  const db = await open();
  const tx = db.transaction(FRIENDS, "readwrite");
  tx.objectStore(FRIENDS).put(f);
  await done(tx);
}

export async function deleteFriend(name: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(FRIENDS, "readwrite");
  tx.objectStore(FRIENDS).delete(name);
  await done(tx);
}
