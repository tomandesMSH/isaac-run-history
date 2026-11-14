// A picture of one run to share: drawn on a canvas in the page's style (the game's paper, fonts and
// item sprites when the graphics are there) and handed over as a PNG.

import { itemInfo } from "./data/items";
import { characterName, dateTime, difficultyName, duration, resultText } from "./format";
import type { Run } from "./model/schema";

const W = 1000;
const H = 700;
const INK = "#1e0f0b";
const MUTED = "#6a4c37";

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function runCard(run: Run): Promise<Blob> {
  const gfx = document.body.classList.contains("has-gfx");
  const title = gfx ? "Upheaval, Silkscreen, monospace" : "Silkscreen, monospace";
  const text = gfx ? "TeamMeat, 'Pixelify Sans', monospace" : "'Pixelify Sans', monospace";
  // the fonts are drawn on whole multiples of their pixel grid (Upheaval 18px, TeamMeat 25px)
  await Promise.all([document.fonts.load(`54px ${title}`), document.fonts.load(`25px ${text}`)]).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#2a2220";
  ctx.fillRect(0, 0, W, H);

  // the paper, 3x (304x212 -> 912x636)
  const paper = gfx ? await loadImage("gfx/paper.png") : undefined;
  const px = (W - 912) / 2, py = (H - 636) / 2;
  if (paper) ctx.drawImage(paper, px, py, 912, 636);
  else {
    ctx.fillStyle = "#d6bf98";
    ctx.fillRect(px, py, 912, 636);
  }

  const left = px + 70;
  const right = px + 912 - 70;
  const width = right - left;
  let y = py + 100;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9b1410";
  ctx.font = `54px ${title}`;
  ctx.fillText(fit(ctx, characterName(run).toUpperCase(), width * 0.7), left, y);
  ctx.fillStyle = MUTED;
  ctx.font = `25px ${text}`;
  ctx.textAlign = "right";
  ctx.fillText(difficultyName(run.difficulty), right, y);
  ctx.textAlign = "left";

  y += 56;
  ctx.font = `50px ${text}`;
  ctx.fillStyle = run.result.type === "win" ? "#2a5516" : run.result.type === "death" ? "#b3201c" : INK;
  ctx.fillText(fit(ctx, resultText(run), width), left, y);

  y += 40;
  ctx.font = `25px ${text}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(fit(ctx, [dateTime(run.startedAt), `run time ${duration(run.durationFrames)}`, `seed ${run.seed}`].join("  ·  "), width), left, y);

  const s = run.stats;
  if (s) {
    y += 34;
    const r = (v?: number) => (v === undefined ? "?" : String(Math.round(v * 100) / 100));
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, `DMG ${r(s.damage)}   TEARS ${r(s.tears)}   SPEED ${r(s.speed)}   RANGE ${r(s.range)}   SHOT ${r(s.shotSpeed)}   LUCK ${r(s.luck)}`, width), left, y);
  }

  // item sprites: 2x when they fit in three rows, else 1x
  y += 26;
  const items = run.items;
  const bottom = py + 636 - 80;
  const scale = Math.ceil(items.length / Math.floor(width / 68)) <= Math.floor((bottom - y) / 68) ? 2 : 1;
  const cellSize = 32 * scale + 4;
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor((bottom - y) / cellSize);
  const room = cols * rows;
  const shown = items.length > room ? items.slice(0, room - 1) : items;
  const icons = await Promise.all(shown.map((i) => {
    const src = itemInfo(i.id, i.name).icon;
    return src ? loadImage(src) : Promise.resolve(undefined);
  }));
  shown.forEach((item, k) => {
    const cx = left + (k % cols) * cellSize;
    const cy = y + Math.floor(k / cols) * cellSize;
    const img = icons[k];
    ctx.globalAlpha = item.removed ? 0.4 : 1;
    if (img) ctx.drawImage(img, cx, cy, 32 * scale, 32 * scale);
    else {
      ctx.fillStyle = MUTED;
      ctx.font = `25px ${text}`;
      ctx.fillText("?", cx + 12 * scale, cy + 24 * scale);
    }
    ctx.globalAlpha = 1;
  });
  if (items.length > shown.length) {
    const k = shown.length;
    ctx.fillStyle = INK;
    ctx.font = `25px ${text}`;
    ctx.fillText(`+${items.length - k}`, left + (k % cols) * cellSize + 4, y + Math.floor(k / cols) * cellSize + 20 * scale);
  }
  if (items.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.fillText("Nothing picked up.", left, y + 30);
  }

  ctx.font = `25px ${text}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText(`${items.length} item${items.length === 1 ? "" : "s"}  ·  Isaac Run History`, right, py + 636 - 44);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the picture."))), "image/png"));
}

/** Draws the run, copies the PNG to the clipboard where the browser allows it, and downloads it. */
export async function shareRun(run: Run): Promise<string> {
  const blob = await runCard(run);
  let copied = false;
  try {
    if (navigator.clipboard && "ClipboardItem" in window) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copied = true;
    }
  } catch {
    // not allowed here (permissions, insecure page): the download still happens
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `isaac-run-${run.seed.replace(/\s+/g, "")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return copied ? "Copied and saved" : "Saved";
}
