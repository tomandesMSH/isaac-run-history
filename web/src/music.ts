// Music of the chosen floor, from mus/ (tools/music_manifest.py lists the files).
//
// The volume always starts at 0 on a page load: nothing plays until the viewer turns it up (which
// is also the click browsers want before they play sound). Turning it up starts the floor's
// track: its intro once if it has one, then the loop. The soundtrack choice is remembered.

import { h } from "./dom";

interface Track {
  loop: string;
  intro?: string;
}

interface MusicManifest {
  soundtracks: { key: string; name: string }[];
  tracks: Record<string, Record<string, Track>>;
}

const STORAGE_KEY = "isaac-run-history.soundtrack";
const LEVELS = 10;

let manifest: MusicManifest | null = null;
let soundtrack = "rep";
let floor: string | null = null;
let level = 0;
let wantPlay = true; // the play/pause button; sound only plays with the volume above 0 too
let playing = false;
let intro: HTMLAudioElement | null = null;
let loop: HTMLAudioElement | null = null;
let active: HTMLAudioElement | null = null;
const listeners: (() => void)[] = [];

function url(path: string): string {
  return new URL(`mus/${path.split("/").map(encodeURIComponent).join("/")}`, document.baseURI).href;
}

function trackFor(key: string | null): Track | undefined {
  if (!manifest || !key) return undefined;
  // a floor the chosen soundtrack has no track for plays the other one's (Antibirth has no Dross)
  return manifest.tracks[soundtrack]?.[key]
    ?? manifest.soundtracks.map((s) => manifest!.tracks[s.key]?.[key]).find(Boolean);
}

function applyVolume(): void {
  const v = (level / LEVELS) ** 2; // closer to how loud it sounds
  if (intro) intro.volume = v;
  if (loop) loop.volume = v;
}

function playEl(el: HTMLAudioElement): void {
  active = el;
  el.play().catch(() => {
    // the browser refused (no click yet): show it as paused
    playing = false;
    notify();
  });
}

function stopAudio(): void {
  intro?.pause();
  loop?.pause();
  intro = loop = active = null;
  playing = false;
}

function startAudio(): void {
  const t = trackFor(floor);
  if (!t) return;
  const thisLoop = new Audio(url(t.loop));
  thisLoop.loop = true;
  loop = thisLoop;
  if (t.intro) {
    const thisIntro = new Audio(url(t.intro));
    intro = thisIntro;
    thisIntro.addEventListener("ended", () => {
      if (intro === thisIntro && playing) playEl(thisLoop);
    });
    applyVolume();
    playEl(thisIntro);
  } else {
    intro = null;
    applyVolume();
    playEl(thisLoop);
  }
  playing = true;
}

function sync(): void {
  const should = wantPlay && level > 0 && !!trackFor(floor);
  if (should && !playing) {
    if (active) {
      playing = true;
      playEl(active); // resume where it paused
    } else {
      startAudio();
    }
  } else if (!should && playing) {
    active?.pause();
    playing = false;
  }
  applyVolume();
  notify();
}

function notify(): void {
  for (const f of listeners) f();
}

/** Called when the background floor changes: switch to its track. */
export function setMusicFloor(key: string): void {
  if (key === floor) return;
  floor = key;
  if (playing || active) stopAudio();
  sync();
}

function setSoundtrack(key: string): void {
  if (key === soundtrack) return;
  soundtrack = key;
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* not kept */ }
  stopAudio();
  sync();
}

function setLevel(n: number): void {
  level = Math.max(0, Math.min(LEVELS, n));
  sync();
}

// ------------------------------------------------------------------------------------------------
// Controls: a speaker in the top bar opening "▶ MUSIC ////////" and the soundtrack choice
// ------------------------------------------------------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";

function speakerIcon(): SVGSVGElement {
  // 16x16 pixel speaker; .waves shows while sound plays, .mute while it doesn't
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "28");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("speaker");
  const parts: [string, string][] = [
    ["body", "M1 5h3v6H1zM4 4h1v8H4zM5 3h1v10H5zM6 2h1v12H6zM7 1h1v14H7z"],
    ["waves", "M10 5h1v6h-1zM12 3h1v10h-1zM14 1h1v14h-1z"],
    ["mute", "M10 5h1v1h-1zM11 6h1v1h-1zM12 7h1v2h-1zM11 9h1v1h-1zM10 10h1v1h-1zM14 5h1v1h-1zM13 6h1v1h-1zM13 9h1v1h-1zM14 10h1v1h-1z"],
  ];
  for (const [cls, d] of parts) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", cls);
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
  }
  return svg;
}

export function setupMusic(m: MusicManifest): void {
  if (!m.soundtracks?.length) return;
  manifest = m;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && m.tracks[saved]) soundtrack = saved;
  } catch { /* default */ }
  if (!m.tracks[soundtrack]) soundtrack = m.soundtracks[0].key;

  const menu = document.getElementById("music-menu") as HTMLDetailsElement | null;
  const summary = menu?.querySelector("summary");
  const panel = document.getElementById("music-panel");
  if (!menu || !summary || !panel) return;
  const icon = speakerIcon();
  summary.appendChild(icon);
  menu.hidden = false;

  const playBtn = h("button", {
    class: "music-play", type: "button",
    onClick: () => {
      if (playing) {
        wantPlay = false;
      } else {
        wantPlay = true;
        if (level === 0) level = 3; // play at volume 0 would stay silent: give it some
      }
      sync();
    },
  });
  const bars = Array.from({ length: LEVELS }, (_, i) =>
    h("span", {
      class: "vol-bar",
      onClick: () => setLevel(level === i + 1 ? i : i + 1), // clicking the top bar again lowers it
    }));
  const slider = h("div", {
    class: "music-volume", role: "slider", tabindex: 0, "aria-label": "Music volume",
    "aria-valuemin": 0, "aria-valuemax": LEVELS,
    onKeydown: (e: KeyboardEvent) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (step) { e.preventDefault(); setLevel(level + step); }
      if (e.key === "Home") setLevel(0);
      if (e.key === "End") setLevel(LEVELS);
    },
  }, bars);
  const choices = m.soundtracks.map((s) =>
    h("button", { class: "music-soundtrack-option", type: "button", role: "radio", onClick: () => setSoundtrack(s.key) }, s.name));

  panel.replaceChildren(
    h("div", { class: "music-row" }, playBtn, h("span", { class: "music-label" }, "Music"), slider),
    h("div", { class: "music-soundtrack", role: "radiogroup", "aria-label": "Soundtrack" }, choices));

  const render = () => {
    const audible = playing && level > 0;
    playBtn.classList.toggle("is-playing", playing);
    playBtn.setAttribute("aria-label", playing ? "Pause music" : "Play music");
    bars.forEach((b, i) => b.classList.toggle("on", i < level));
    slider.style.setProperty("--level", String(level));
    slider.setAttribute("aria-valuenow", String(level));
    slider.setAttribute("aria-valuetext", level === 0 ? "off" : `${level} of ${LEVELS}`);
    choices.forEach((c, i) => c.setAttribute("aria-checked", String(m.soundtracks[i].key === soundtrack)));
    icon.classList.toggle("audible", audible);
    summary.setAttribute("aria-label", audible ? `Music: playing, volume ${level} of ${LEVELS}` : "Music: off");
  };
  listeners.push(render);
  render();
}
