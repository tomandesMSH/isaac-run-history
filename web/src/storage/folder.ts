// The connected history folder (<Isaac>/data/isaac-run-history): picked once with the File System
// Access API (Chromium only), remembered in IndexedDB and re-read on every visit, so new runs show
// up without importing a file by hand. Reading again needs the browser's permission; it's kept for
// the session, and after a restart the browser asks once more on the first click.

import { loadHandle, saveHandle } from "./db";

type Permission = "granted" | "denied" | "prompt";

// Not in TypeScript's DOM types yet.
interface PermissionHandle {
  queryPermission(o: { mode: "read" }): Promise<Permission>;
  requestPermission(o: { mode: "read" }): Promise<Permission>;
}
type Picker = (o?: { id?: string; mode?: "read"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;

export interface FolderFile { name: string; text: string }

export const folderSupported = typeof (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker === "function";

let handle: FileSystemDirectoryHandle | undefined;
const seen = new Map<string, number>(); // file name -> lastModified already read

export async function connectedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!folderSupported) return undefined;
  if (!handle) handle = await loadHandle().catch(() => undefined);
  return handle;
}

/** Whether the folder can be read now without asking (permission already granted). */
export async function folderReady(): Promise<boolean> {
  const h = await connectedFolder();
  return !!h && (await (h as unknown as PermissionHandle).queryPermission({ mode: "read" })) === "granted";
}

/** Ask for the folder (must run from a click). Returns undefined when the user cancels. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  const picker = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker;
  try {
    handle = await picker({ id: "isaac-run-history", mode: "read", startIn: "documents" });
  } catch (e) {
    if ((e as Error).name === "AbortError") return undefined;
    throw e;
  }
  seen.clear();
  await saveHandle(handle);
  return handle;
}

export async function forgetFolder(): Promise<void> {
  handle = undefined;
  seen.clear();
  await saveHandle(undefined);
}

/** Ask for read permission again (must run from a click). */
export async function allowFolder(): Promise<boolean> {
  const h = await connectedFolder();
  return !!h && (await (h as unknown as PermissionHandle).requestPermission({ mode: "read" })) === "granted";
}

/** The save*.dat files changed since the last read (all of them with force). */
export async function readFolder(force = false): Promise<FolderFile[]> {
  const h = await connectedFolder();
  if (!h) return [];
  const out: FolderFile[] = [];
  for await (const entry of (h as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind !== "file" || !/^save\d\.dat$/i.test(entry.name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    if (!force && seen.get(file.name) === file.lastModified) continue;
    seen.set(file.name, file.lastModified);
    out.push({ name: file.name, text: await file.text() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
