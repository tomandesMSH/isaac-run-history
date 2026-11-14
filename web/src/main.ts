// App shell: loads runs from the browser database, imports exports, routes between pages.

import "./style.css";
import { clear, copyButton, h } from "./dom";
import { parseExport, type Lifetime, type Run } from "./model/schema";
import { parseRoute } from "./router";
import { useExtractedIcons } from "./data/items";
import { setupBackgrounds } from "./background";
import { setupMusic, type MusicManifest } from "./music";
import musicManifest from "./data/music-manifest.json";
import { clearRuns, deleteRun, loadLifetimes, loadRuns, saveLifetime, saveRuns } from "./storage/db";
import { defaultStatsOptions, renderStats } from "./views/stats";
import { renderRuns } from "./views/runs";
import { renderRun } from "./views/run";
import { renderBestiary } from "./views/bestiary";
import { renderCharacter } from "./views/character";
import { renderItems } from "./views/items";
import { renderLifetime } from "./views/lifetime";

const state = {
  runs: [] as Run[],
  lifetimes: [] as Lifetime[],
  lifetimeSlot: undefined as string | undefined,
  statsOptions: { ...defaultStatsOptions },
  dbError: null as string | null,
};

const main = document.getElementById("main")!;
const toastBox = document.getElementById("toasts")!;
const runCount = document.getElementById("run-count")!;

function toast(text: string, kind: "ok" | "error" = "ok"): void {
  const el = h("div", { class: `toast toast-${kind}`, role: kind === "error" ? "alert" : "status" }, text);
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), kind === "error" ? 9000 : 5000);
}

// ------------------------------------------------------------------------------------------------
// Import
// ------------------------------------------------------------------------------------------------

async function importText(text: string, source: string): Promise<void> {
  try {
    const parsed = parseExport(text);
    if (parsed.runs.length === 0 && !parsed.lifetime) {
      toast(`${source}: no finished runs in it yet.`, "error");
      return;
    }
    const { added, updated } = await saveRuns(parsed.runs);
    state.runs = await loadRuns();
    let life = "";
    if (parsed.lifetime) {
      life = (await saveLifetime(parsed.lifetime)) ? ", lifetime stats updated" : ", lifetime stats older than the ones here";
      state.lifetimes = await loadLifetimes();
      state.lifetimeSlot = parsed.lifetime.slot;
    }
    const slot = parsed.saveSlot ? ` (save slot ${parsed.saveSlot})` : "";
    toast(`${source}${slot}: ${added} new run${added === 1 ? "" : "s"}${updated ? `, ${updated} already here` : ""}${life}.`);
    render();
  } catch (e) {
    toast(`${source}: ${(e as Error).message}`, "error");
  }
}

async function importFiles(files: FileList | File[]): Promise<void> {
  for (const f of Array.from(files)) await importText(await f.text(), f.name);
}

const fileInput = h("input", {
  type: "file", accept: ".dat,.json,application/json,text/plain", multiple: true, hidden: true,
  onChange: () => { if (fileInput.files) void importFiles(fileInput.files).then(() => (fileInput.value = "")); },
});
document.body.appendChild(fileInput);

const pasteArea = h("textarea", { rows: 8, placeholder: '{"format":"isaac-run-history", ...}', "aria-label": "Exported JSON" });
const pasteDialog = h("dialog", { class: "dialog" },
  h("form", { method: "dialog" },
    h("h2", null, "Paste an export"),
    h("p", { class: "muted" }, "Type ", h("code", null, "rh export"), " in the game's console, then paste here."),
    pasteArea,
    h("div", { class: "dialog-actions" },
      h("button", { class: "btn", value: "cancel" }, "Cancel"),
      h("button", {
        class: "btn btn-primary", value: "import",
        onClick: () => { const t = pasteArea.value; pasteArea.value = ""; if (t.trim()) void importText(t, "Pasted export"); },
      }, "Import"))));
document.body.appendChild(pasteDialog);

function openFilePicker(): void { fileInput.click(); }
function openPaste(): void { pasteDialog.showModal(); pasteArea.focus(); }

// Drag & drop anywhere on the page.
const dropOverlay = document.getElementById("drop-overlay")!;
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  dropOverlay.hidden = false;
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files);
});

// ------------------------------------------------------------------------------------------------
// Data menu
// ------------------------------------------------------------------------------------------------

function downloadAll(): void {
  const data = JSON.stringify({ format: "isaac-run-history", version: 1, runs: state.runs }, null, 1);
  const a = h("a", { href: URL.createObjectURL(new Blob([data], { type: "application/json" })), download: "isaac-run-history.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function clearAll(): Promise<void> {
  if (!confirm(`Remove all ${state.runs.length} runs from this browser? The files in the game aren't touched.`)) return;
  await clearRuns();
  state.runs = [];
  state.lifetimes = [];
  toast("All runs removed from this browser.");
  location.hash = "#/stats";
  render();
}

document.getElementById("btn-import")!.addEventListener("click", openFilePicker);
document.getElementById("btn-paste")!.addEventListener("click", openPaste);
document.getElementById("btn-download")!.addEventListener("click", downloadAll);
document.getElementById("btn-clear")!.addEventListener("click", () => void clearAll());

// ------------------------------------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------------------------------------

// The mod's history folder on a default Steam install; pasted into the file picker it opens there.
const HISTORY_FOLDER = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\The Binding of Isaac Rebirth\\data\\isaac-run-history";

function emptyState(): HTMLElement {
  return h("div", { class: "page empty" },
    h("h1", null, "Count your sins."),
    h("p", { class: "lead" }, "Win rate per character, the items that win you runs, what keeps killing you and where."),
    h("div", { class: "path-row" },
      h("code", null, HISTORY_FOLDER),
      copyButton(HISTORY_FOLDER, "Copy path")),
    h("button", { class: "dropzone", type: "button", onClick: openFilePicker },
      h("strong", null, "Drop your history file here"),
      h("span", null, "save1.dat (or save2 / save3), or click to choose it")),
    h("p", null, "No file at hand? Type ", h("code", null, "rh export"), " in the game's console and ",
      h("button", { class: "link", type: "button", onClick: openPaste }, "paste it here"), "."),
    h("p", { class: "muted small" }, "Needs the Isaac Run History mod (Repentance+ with REPENTOGON). ",
      "Everything stays in this browser; nothing is uploaded anywhere."),
    state.dbError ? h("p", { class: "toast toast-error" }, state.dbError) : null);
}

function setActiveNav(name: string): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".nav a")) {
    a.classList.toggle("active", a.dataset.route === name);
    if (a.dataset.route === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function render(): void {
  runCount.textContent = state.runs.length ? `${state.runs.length} run${state.runs.length === 1 ? "" : "s"}` : "";
  const hasData = state.runs.length > 0 || state.lifetimes.length > 0;
  document.body.classList.toggle("no-data", !hasData);
  const route = parseRoute(location.hash);
  setActiveNav(route.name === "run" ? "runs" : route.name === "bestiary" || route.name === "items" ? "lifetime" : route.name === "character" ? "stats" : route.name);

  if (!hasData) {
    clear(main, emptyState());
    return;
  }
  switch (route.name) {
    case "stats":
      clear(main, renderStats(state.runs, state.statsOptions, (o) => { state.statsOptions = o; render(); }));
      break;
    case "runs":
      clear(main, renderRuns(state.runs, route.filters));
      break;
    case "lifetime":
      clear(main, renderLifetime(state.lifetimes, state.lifetimeSlot, (slot) => { state.lifetimeSlot = slot; render(); }));
      break;
    case "character":
      clear(main, renderCharacter(route.key, state.runs, state.lifetimes, state.lifetimeSlot, state.statsOptions.countQuits));
      window.scrollTo(0, 0);
      break;
    case "items":
      clear(main, renderItems(state.lifetimes, state.lifetimeSlot, state.runs, state.statsOptions.countQuits));
      window.scrollTo(0, 0);
      break;
    case "bestiary":
      clear(main, renderBestiary(state.lifetimes, state.lifetimeSlot));
      window.scrollTo(0, 0);
      break;
    case "run":
      clear(main, renderRun(state.runs.find((r) => r.id === route.id), async (run) => {
        await deleteRun(run.id);
        state.runs = state.runs.filter((r) => r.id !== run.id);
        location.hash = "#/runs";
      }));
      window.scrollTo(0, 0);
      break;
  }
}

window.addEventListener("hashchange", render);

// Game graphics (room, paper, fonts, icons) when tools/extract_assets.py has been run; without
// them the page keeps its own CSS look.
async function loadGameGraphics(): Promise<void> {
  try {
    const res = await fetch("gfx/manifest.json", { cache: "no-cache" });
    if (!res.ok) return;
    const manifest = await res.json();
    useExtractedIcons(manifest);
    setupBackgrounds(manifest.backgrounds ?? [], manifest.defaultBackground ?? "mausoleum", manifest.sprites ?? {});
    const link = h("link", { rel: "stylesheet", href: "gfx-theme.css" });
    await new Promise<void>((resolve) => {
      link.addEventListener("load", () => resolve());
      link.addEventListener("error", () => resolve());
      document.head.appendChild(link);
    });
    await document.fonts.load('20px "TeamMeat"').catch(() => undefined);
    document.body.classList.add("has-gfx");
  } catch {
    // no graphics: the CSS look stays
  }
}

// The floors' music, from its own repo (tools/music_manifest.py writes the manifest).
async function loadMusic(): Promise<void> {
  setupMusic(musicManifest as MusicManifest);
}

Promise.all([
  loadRuns().then((runs) => { state.runs = runs; }).catch((e: Error) => { state.dbError = e.message; }),
  loadLifetimes().then((l) => { state.lifetimes = l; }).catch(() => undefined),
  loadMusic().then(loadGameGraphics),
]).finally(render);
