// The floor the page is set in (room walls, floor, doors), chosen in the top bar and remembered
// in this browser. The images come from gfx/ (tools/extract_assets.py).

import { h } from "./dom";
import { setMusicFloor } from "./music";

export interface BackgroundInfo {
  key: string;
  name: string;
  /** Props for the four corners (top-left, top-right, bottom-left, bottom-right): sprite names. */
  deco?: string[];
  /** Details on the walls (Mausoleum's torches): positions in a 468x312 room. */
  details?: WallDetail[];
  /** Floor under water (Downpour, Dross, Flooded Caves). */
  wet?: boolean;
}

export interface WallDetail {
  sprite: string;
  wall: "top" | "bottom" | "left" | "right";
  /** Where along the wall, 0-1. */
  at: number;
  /** How far in from the wall's outer edge, in the game's pixels. */
  inset: number;
}

/** A prop sprite in gfx/deco: size of one frame in the game's pixels; frames > 1 is an animation strip. */
export interface SpriteInfo {
  w: number;
  h: number;
  frames: number;
  /** Pivot: the point of the sprite placed on a detail's position. */
  px?: number;
  py?: number;
  /** Seconds per animation frame. */
  frameTime?: number;
  /** Colour of the light around it, if it gives off any. */
  glow?: string | null;
}

const SCALE = 3; // props are drawn at 3x (whole multiples keep the pixels sharp)
const WALL_SCALE = 2; // walls (and what's on them) are drawn at 2x

const STORAGE_KEY = "isaac-run-history.background";

function cssUrl(path: string): string {
  return `url("${new URL(path, document.baseURI).href}")`;
}

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // private mode etc.: the choice just isn't kept
  }
}

function setCorner(el: HTMLElement, name: string | undefined, sprites: Record<string, SpriteInfo>): void {
  const sprite = name ? sprites[name] : undefined;
  if (!name || !sprite) {
    el.style.backgroundImage = "";
    el.style.width = el.style.height = "0";
    return;
  }
  const w = sprite.w * SCALE;
  const h = sprite.h * SCALE;
  el.style.backgroundImage = cssUrl(`gfx/deco/${name}.png`);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.backgroundSize = `${w * sprite.frames}px ${h}px`;
  el.style.setProperty("--frames", String(sprite.frames));
  el.style.setProperty("--strip-w", `${w * sprite.frames}px`);
  el.classList.toggle("animated", sprite.frames > 1);
}

function detailElement(d: WallDetail, sprite: SpriteInfo): HTMLElement {
  const S = WALL_SCALE;
  const w = sprite.w * S;
  const hgt = sprite.h * S;
  const px = (sprite.px ?? 0) * S;
  const py = (sprite.py ?? 0) * S;
  const inset = d.inset * S;
  const el = document.createElement("span");
  el.className = `detail${sprite.frames > 1 ? " animated" : ""}`;
  const st = el.style;
  st.backgroundImage = cssUrl(`gfx/deco/${d.sprite}.png`);
  st.width = `${w}px`;
  st.height = `${hgt}px`;
  st.backgroundSize = `${w * sprite.frames}px ${hgt}px`;
  st.setProperty("--frames", String(sprite.frames));
  st.setProperty("--strip-w", `${w * sprite.frames}px`);
  st.setProperty("--duration", `${sprite.frames * (sprite.frameTime ?? 0.1)}s`);
  st.animationDelay = `-${(d.at * 7) % 1}s`; // not all in step
  if (sprite.glow) st.filter = `drop-shadow(0 0 3px ${sprite.glow}) drop-shadow(0 0 12px ${sprite.glow})`;
  const top = "var(--room-top, 0px)";
  const along = `calc(${top} + ${d.at} * (100vh - ${top}) - ${py}px)`;
  switch (d.wall) {
    case "top":
      st.left = `calc(${d.at * 100}vw - ${px}px)`;
      st.top = `calc(${top} + ${inset - py}px)`;
      break;
    case "bottom": // mirrored top-down
      st.left = `calc(${d.at * 100}vw - ${px}px)`;
      st.bottom = `${inset - py}px`;
      st.transform = "scaleY(-1)";
      break;
    case "left":
      st.left = `${inset - px}px`;
      st.top = along;
      break;
    case "right": // mirrored left-right
      st.right = `${inset - px}px`;
      st.top = along;
      st.transform = "scaleX(-1)";
      break;
  }
  return el;
}

export function setupBackgrounds(list: BackgroundInfo[], defaultKey: string, sprites: Record<string, SpriteInfo> = {}): void {
  if (list.length === 0) return;
  const menu = document.getElementById("bg-menu") as HTMLDetailsElement;
  const box = document.getElementById("bg-list")!;
  const buttons = new Map<string, HTMLButtonElement>();
  const corners = ["tl", "tr", "bl", "br"].map((c) => document.querySelector<HTMLElement>(`.deco-${c}`));
  const byKey = new Map(list.map((b) => [b.key, b]));
  const detailsBox = document.querySelector<HTMLElement>(".room-details");

  // the room starts below the top bar, so the bar doesn't cover the top wall
  const topbar = document.querySelector<HTMLElement>(".topbar");
  if (topbar) {
    const update = () => document.body.style.setProperty("--room-top", `${topbar.offsetHeight}px`);
    new ResizeObserver(update).observe(topbar);
    update();
  }

  const apply = (key: string) => {
    const s = document.body.style;
    s.setProperty("--room-img", cssUrl(`gfx/rooms/${key}.png`));
    s.setProperty("--floor-img", cssUrl(`gfx/floors/${key}.png`));
    s.setProperty("--door-left", cssUrl(`gfx/doors/${key}-left.png`));
    s.setProperty("--door-right", cssUrl(`gfx/doors/${key}-right.png`));
    document.body.classList.toggle("wet-floor", !!byKey.get(key)?.wet);
    setMusicFloor(key);
    const deco = byKey.get(key)?.deco ?? [];
    corners.forEach((el, i) => el && setCorner(el, deco[i], sprites));
    detailsBox?.replaceChildren(...(byKey.get(key)?.details ?? [])
      .filter((d) => sprites[d.sprite])
      .map((d) => detailElement(d, sprites[d.sprite])));
    for (const [k, b] of buttons) b.setAttribute("aria-pressed", String(k === key));
  };

  for (const bg of list) {
    const btn = h("button", {
      class: "menu-item bg-option", type: "button", "aria-pressed": "false",
      onClick: () => { apply(bg.key); remember(bg.key); menu.open = false; },
    },
      h("span", { class: "bg-swatch", style: { backgroundImage: cssUrl(`gfx/floors/${bg.key}.png`) } }),
      bg.name);
    buttons.set(bg.key, btn);
    box.appendChild(btn);
  }

  const saved = remembered();
  apply(saved && buttons.has(saved) ? saved : buttons.has(defaultKey) ? defaultKey : list[0].key);
}
