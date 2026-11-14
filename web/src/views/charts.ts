// Hand-drawn SVG charts for the Statistics page: runs over time (stacked bars), win rate over time
// (line) and a calendar heatmap of days played. No chart library; each mark has a <title>, which is
// the browser's hover tooltip, and the series colors come from CSS (charts in style.css).

import { emptyNote, h } from "../dom";
import { floorName } from "../data/game";
import { isGreed, percent } from "../format";
import type { Run, Stats } from "../model/schema";
import { isDecided } from "../stats/stats";

const SVG = "http://www.w3.org/2000/svg";

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

function tip(text: string): SVGTitleElement {
  return s("title", {}, text);
}

const DAY = 86400000;

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekStart(d: Date): Date {
  const day = dayStart(d);
  return new Date(day.getTime() - ((day.getDay() + 6) % 7) * DAY); // Monday
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

interface Bucket {
  start: Date;
  label: string;
  wins: number;
  deaths: number;
  quits: number;
  /** win rate of the last 10 decided runs up to the end of this bucket */
  rolling?: number;
}

function buckets(runs: Run[], countQuits: boolean): Bucket[] {
  const dated = runs.filter((r) => r.startedAt && !Number.isNaN(Date.parse(r.startedAt)))
    .sort((a, b) => a.startedAt!.localeCompare(b.startedAt!));
  if (dated.length === 0) return [];
  const first = dayStart(new Date(dated[0].startedAt!));
  const last = dayStart(new Date(dated[dated.length - 1].startedAt!));
  const weekly = (last.getTime() - first.getTime()) / DAY > 60;
  const keyOf = (d: Date) => (weekly ? weekStart(d) : dayStart(d)).getTime();
  const list: Bucket[] = [];
  const byKey = new Map<number, Bucket>();
  // every day (or week) between the first and the last run gets a bar, empty ones too
  for (let t = keyOf(first); t <= keyOf(last); t = keyOf(new Date(t + (weekly ? 7 : 1) * DAY + DAY / 2))) {
    const start = new Date(t);
    const b: Bucket = { start, label: weekly ? `week of ${fmtDay(start)}` : fmtDay(start), wins: 0, deaths: 0, quits: 0 };
    list.push(b);
    byKey.set(t, b);
  }
  const recent: boolean[] = [];
  let i = 0;
  for (const b of list) {
    for (; i < dated.length && keyOf(new Date(dated[i].startedAt!)) === b.start.getTime(); i++) {
      const r = dated[i];
      if (r.result.type === "win") b.wins++;
      else if (r.result.type === "death") b.deaths++;
      else b.quits++;
      if (isDecided(r, countQuits)) recent.push(r.result.type === "win");
    }
    const window = recent.slice(-10);
    // a point only on days (weeks) that had a decided run
    if (window.length && b.wins + b.deaths + (countQuits ? b.quits : 0) > 0) b.rolling = window.filter(Boolean).length / window.length;
  }
  return list;
}

function niceMax(n: number): number {
  if (n <= 5) return Math.max(1, n);
  const step = n <= 20 ? 5 : n <= 50 ? 10 : 25;
  return Math.ceil(n / step) * step;
}

const W = 760;
const PAD = { left: 34, right: 8, top: 8, bottom: 22 };

function xLabels(list: Bucket[], x: (i: number) => number, height: number): SVGElement[] {
  // first, last and a few in between, so they never collide
  const n = list.length;
  const count = Math.min(n, 6);
  const idx = new Set<number>();
  for (let k = 0; k < count; k++) idx.add(Math.round((k * (n - 1)) / Math.max(1, count - 1)));
  return [...idx].map((i) => s("text", { x: x(i), y: height - 6, class: "chart-tick", "text-anchor": "middle" }, fmtDay(list[i].start)));
}

function runsChart(list: Bucket[]): SVGSVGElement {
  const height = 170;
  const innerH = height - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...list.map((b) => b.wins + b.deaths + b.quits)));
  const slot = (W - PAD.left - PAD.right) / list.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const svg = s("svg", { viewBox: `0 0 ${W} ${height}`, class: "chart", role: "img", "aria-label": "Runs per day, split into wins, quits and deaths" });
  for (const v of [0, max / 2, max]) {
    svg.append(s("line", { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? "chart-base" : "chart-grid" }));
    svg.append(s("text", { x: PAD.left - 6, y: y(v) + 4, class: "chart-tick", "text-anchor": "end" }, String(Math.round(v * 10) / 10)));
  }
  list.forEach((b, i) => {
    const total = b.wins + b.deaths + b.quits;
    const g = s("g", { class: "chart-bar" },
      tip(`${b.label}: ${total} run${total === 1 ? "" : "s"} (${b.wins} won, ${b.deaths} died, ${b.quits} quit)`),
      // invisible full-height hit target, bigger than the bar
      s("rect", { x: x(i) - slot / 2, y: PAD.top, width: slot, height: innerH, class: "chart-hit" }));
    let acc = 0;
    for (const [v, cls] of [[b.wins, "win"], [b.quits, "quit"], [b.deaths, "death"]] as const) {
      if (!v) continue;
      const top = y(acc + v);
      // 2px gap between stacked segments
      const hgt = Math.max(1, y(acc) - top - (acc ? 2 : 0));
      g.append(s("rect", { x: x(i) - barW / 2, y: top, width: barW, height: hgt, rx: Math.min(2, barW / 4), class: `chart-${cls}` }));
      acc += v;
    }
    svg.append(g);
  });
  svg.append(...xLabels(list, x, height));
  return svg;
}

function winRateChart(list: Bucket[]): SVGSVGElement {
  const height = 140;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / list.length;
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + innerH - v * innerH;
  const svg = s("svg", { viewBox: `0 0 ${W} ${height}`, class: "chart", role: "img", "aria-label": "Win rate of the last 10 decided runs, over time" });
  for (const v of [0, 0.5, 1]) {
    svg.append(s("line", { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? "chart-base" : "chart-grid" }));
    svg.append(s("text", { x: PAD.left - 6, y: y(v) + 4, class: "chart-tick", "text-anchor": "end" }, percent(v)));
  }
  const pts = list.map((b, i) => ({ b, i })).filter(({ b }) => b.rolling !== undefined);
  if (pts.length > 1) {
    svg.append(s("polyline", { points: pts.map(({ b, i }) => `${x(i)},${y(b.rolling!)}`).join(" "), class: "chart-line" }));
  }
  for (const { b, i } of pts) {
    svg.append(s("g", { class: "chart-point" },
      tip(`${b.label}: ${percent(b.rolling!)} of the last 10 decided runs won`),
      s("rect", { x: x(i) - slot / 2, y: PAD.top, width: slot, height: innerH, class: "chart-hit" }),
      s("circle", { cx: x(i), cy: y(b.rolling!), r: 4, class: "chart-dot" })));
  }
  svg.append(...xLabels(list, x, height));
  return svg;
}

// GitHub-style calendar: the last 53 weeks, one cell per day, darker = more runs
function heatmap(runs: Run[]): SVGSVGElement {
  const perDay = new Map<number, number>();
  for (const r of runs) {
    if (!r.startedAt || Number.isNaN(Date.parse(r.startedAt))) continue;
    const t = dayStart(new Date(r.startedAt)).getTime();
    perDay.set(t, (perDay.get(t) ?? 0) + 1);
  }
  const cell = 11, gap = 2, top = 16, left = 26;
  const today = dayStart(new Date());
  const start = new Date(weekStart(today).getTime() - 52 * 7 * DAY);
  const svg = s("svg", { viewBox: `0 0 ${left + 53 * (cell + gap)} ${top + 7 * (cell + gap)}`, class: "chart heatmap", role: "img", "aria-label": "Runs per day over the last year" });
  ["Mon", "Wed", "Fri"].forEach((d, k) => svg.append(s("text", { x: 0, y: top + (k * 2) * (cell + gap) + cell - 1, class: "chart-tick" }, d)));
  let lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * DAY + DAY / 2);
      const t = dayStart(day).getTime();
      if (t > today.getTime()) continue;
      if (d === 0 && day.getMonth() !== lastMonth) {
        lastMonth = day.getMonth();
        if (w < 51) svg.append(s("text", { x: left + w * (cell + gap), y: 10, class: "chart-tick" }, day.toLocaleDateString(undefined, { month: "short" })));
      }
      const n = perDay.get(t) ?? 0;
      const level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
      svg.append(s("rect", { x: left + w * (cell + gap), y: top + d * (cell + gap), width: cell, height: cell, rx: 2, class: `heat heat-${level}` },
        tip(`${fmtDay(new Date(t))}: ${n} run${n === 1 ? "" : "s"}`)));
    }
  }
  return svg;
}

function legend(items: [string, string][]): HTMLElement {
  return h("div", { class: "chart-legend" }, items.map(([cls, label]) => h("span", null, h("i", { class: `swatch chart-${cls}` }), label)));
}

export function overTime(runs: Run[], countQuits: boolean): HTMLElement {
  const list = buckets(runs, countQuits);
  if (list.length === 0) return emptyNote("No dated runs yet.");
  const weekly = list[0].label.startsWith("week");
  return h("div", { class: "charts" },
    list.length < 2
      ? emptyNote("All your runs are from one day so far. Play on another day to see the trend.")
      : [
        h("h3", { class: "chart-title" }, weekly ? "Runs per week" : "Runs per day"),
        legend([["win", "won"], ["quit", "quit"], ["death", "died"]]),
        h("div", { class: "chart-wrap" }, runsChart(list)),
        h("h3", { class: "chart-title" }, "Win rate", h("span", { class: "muted" }, " · last 10 decided runs")),
        h("div", { class: "chart-wrap" }, winRateChart(list)),
      ],
    h("h3", { class: "chart-title" }, "Days played", h("span", { class: "muted" }, " · last year")),
    h("div", { class: "chart-wrap heatmap-wrap" }, heatmap(runs),
      h("div", { class: "chart-legend heat-legend" }, "less ", [0, 1, 2, 3, 4].map((l) => h("i", { class: `swatch heat heat-${l}` })), " more")));
}

const STAT_KEYS: [keyof Stats, string][] = [
  ["damage", "Damage"], ["tears", "Tears"], ["speed", "Speed"], ["range", "Range"], ["shotSpeed", "Shot speed"], ["luck", "Luck"],
];

/** One run's stats floor by floor (mod 1.4+): a small line chart per stat, each with its own axis.
 * Points are the stats on entering each floor and, last, the final stats. */
export function statsByFloor(run: Run): HTMLElement | null {
  const points: { label: string; stats: Stats }[] = run.floors
    .map((f) => ({ label: floorName(f.stage, f.stageType, isGreed(run), f.curses ?? 0), stats: f.stats }))
    .filter((p): p is { label: string; stats: Stats } => !!p.stats);
  if (points.length === 0) return null;
  if (run.stats) points.push({ label: "End of the run", stats: run.stats });
  if (points.length < 2) return null;

  const W = 260, H = 110, left = 34, right = 10, top = 12, bottom = 18;
  const x = (i: number) => left + (i * (W - left - right)) / (points.length - 1);
  const charts = STAT_KEYS.map(([key, label]) => {
    const vals = points.map((p) => p.stats[key]);
    const known = vals.filter((v): v is number => v !== undefined);
    if (!known.length) return null;
    let lo = Math.min(...known), hi = Math.max(...known);
    if (hi - lo < 0.01) { lo -= 1; hi += 1; }
    const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
    const fmt = (v: number) => String(Math.round(v * 100) / 100);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart stat-chart", role: "img", "aria-label": `${label} floor by floor` });
    svg.append(
      s("line", { x1: left, x2: W - right, y1: y(lo), y2: y(lo), class: "chart-base" }),
      s("line", { x1: left, x2: W - right, y1: y(hi), y2: y(hi), class: "chart-grid" }),
      s("text", { x: left - 4, y: y(hi) + 4, "text-anchor": "end", class: "chart-tick" }, fmt(hi)),
      s("text", { x: left - 4, y: y(lo) + 4, "text-anchor": "end", class: "chart-tick" }, fmt(lo)),
      s("text", { x: left, y: H - 3, class: "chart-tick" }, "start"),
      s("text", { x: W - right, y: H - 3, "text-anchor": "end", class: "chart-tick" }, "end"));
    const pts = vals.map((v, i) => (v === undefined ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
    svg.append(s("polyline", { points: pts, class: "chart-line" }));
    vals.forEach((v, i) => {
      if (v === undefined) return;
      svg.append(s("g", { class: "chart-point" },
        s("circle", { cx: x(i), cy: y(v), r: 12, class: "chart-hit" }),
        s("circle", { cx: x(i), cy: y(v), r: 4, class: "chart-dot" }),
        tip(`${points[i].label}: ${label} ${fmt(v)}`)));
    });
    return h("figure", { class: "stat-fig" }, h("figcaption", { class: "chart-title" }, label, " ",
      h("span", { class: "muted" }, `${fmt(known[0])} → ${fmt(known[known.length - 1])}`)), svg);
  });
  return h("div", { class: "stat-charts" }, charts);
}
