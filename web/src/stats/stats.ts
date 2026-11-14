// Statistics over runs. Pure functions: runs in, numbers out.
//
// Win rate = wins / decided runs. A run is decided when it was won or lost (died); quits and runs
// cut short by a crash don't count unless countQuits is on, then they count as losses.

import { itemQuality } from "../data/counts";
import { BOSSES, ROOM_TYPES, curseNames, endingName, floorName, floorOrder } from "../data/game";

const BOSS_IDS = Object.keys(BOSSES).map(Number);
import { itemInfo, trinketInfo, type ItemInfo } from "../data/items";
import { bossName, characterKey, characterName, isGreed, killerName } from "../format";
import type { Difficulty, Run } from "../model/schema";

export interface StatsOptions {
  difficulty: "all" | Difficulty;
  countQuits: boolean;
  minRuns: number;
}

export interface WinGroup {
  key: string;
  label: string;
  runs: number;
  decided: number;
  wins: number;
  winRate: number;
}

export interface ItemGroup extends WinGroup {
  item: ItemInfo;
}

export interface TrinketGroup extends ItemGroup {
  /** runs it was golden in / smelted (swallowed) in */
  golden: number;
  smelted: number;
}

export interface CountGroup {
  key: string;
  label: string;
  count: number;
  order?: number;
}

export function applyFilters(runs: Run[], opts: StatsOptions): Run[] {
  return opts.difficulty === "all" ? runs : runs.filter((r) => r.difficulty === opts.difficulty);
}

export function isDecided(run: Run, countQuits: boolean): boolean {
  return run.result.type === "win" || run.result.type === "death" || countQuits;
}

function winGroup(key: string, label: string): WinGroup {
  return { key, label, runs: 0, decided: 0, wins: 0, winRate: 0 };
}

function addRun(g: WinGroup, run: Run, countQuits: boolean): void {
  g.runs++;
  if (isDecided(run, countQuits)) g.decided++;
  if (run.result.type === "win") g.wins++;
}

function finish<T extends WinGroup>(groups: Iterable<T>): T[] {
  const list = [...groups];
  for (const g of list) g.winRate = g.decided > 0 ? g.wins / g.decided : 0;
  return list;
}

export interface Summary {
  total: number;
  wins: number;
  deaths: number;
  quits: number;
  winRate: number;
  avgDuration?: number;
  avgWinDuration?: number;
  avgDeathDuration?: number;
  avgItems?: number;
}

function avg(values: number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

export function summary(runs: Run[], countQuits: boolean): Summary {
  const wins = runs.filter((r) => r.result.type === "win");
  const deaths = runs.filter((r) => r.result.type === "death");
  const decided = runs.filter((r) => isDecided(r, countQuits)).length;
  const frames = (list: Run[]) => avg(list.map((r) => r.durationFrames).filter((f): f is number => f !== undefined));
  return {
    total: runs.length,
    wins: wins.length,
    deaths: deaths.length,
    quits: runs.length - wins.length - deaths.length,
    winRate: decided > 0 ? wins.length / decided : 0,
    // run length only over runs that were played out: quick resets would drag it down
    avgDuration: frames([...wins, ...deaths]),
    avgWinDuration: frames(wins),
    avgDeathDuration: frames(deaths),
    avgItems: avg([...wins, ...deaths].map((r) => r.items.filter((i) => !i.starting).length)),
  };
}

export function winRateByCharacter(runs: Run[], countQuits: boolean): WinGroup[] {
  const groups = new Map<string, WinGroup>();
  for (const r of runs) {
    const key = characterKey(r);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = winGroup(key, characterName(r))));
    addRun(g, r, countQuits);
  }
  return finish(groups.values()).sort((a, b) => b.runs - a.runs || b.winRate - a.winRate);
}

/** Per item: in how many runs it was picked up (starting items left out), and how those runs went. */
export function itemGroups(runs: Run[], countQuits: boolean): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const r of runs) {
    const seen = new Set<string>();
    for (const pickup of r.items) {
      if (pickup.starting) continue;
      const item = itemInfo(pickup.id, pickup.name);
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      let g = groups.get(item.key);
      if (!g) groups.set(item.key, (g = { ...winGroup(item.key, item.name), item }));
      addRun(g, r, countQuits);
    }
  }
  return finish(groups.values());
}

/** Per trinket: in how many runs it was held (starting ones left out), and how those runs went. */
export function trinketGroups(runs: Run[], countQuits: boolean): TrinketGroup[] {
  const groups = new Map<string, TrinketGroup>();
  for (const r of runs) {
    const seen = new Map<string, { golden: boolean; smelted: boolean }>();
    for (const t of r.trinkets) {
      if (t.starting) continue;
      const info = trinketInfo(t.id, t.name);
      const s = seen.get(info.key) ?? { golden: false, smelted: false };
      s.golden ||= !!t.golden;
      s.smelted ||= !!t.smelted;
      if (!seen.has(info.key)) {
        let g = groups.get(info.key);
        if (!g) groups.set(info.key, (g = { ...winGroup(info.key, info.name), item: info, golden: 0, smelted: 0 }));
        addRun(g, r, countQuits);
      }
      seen.set(info.key, s);
    }
    for (const [key, s] of seen) {
      const g = groups.get(key)!;
      if (s.golden) g.golden++;
      if (s.smelted) g.smelted++;
    }
  }
  return finish(groups.values());
}

export function mostPickedItems<T extends ItemGroup>(groups: T[], limit = 20): T[] {
  return [...groups].sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label)).slice(0, limit);
}

export function bestItems<T extends ItemGroup>(groups: T[], minRuns: number, limit = 20): T[] {
  return groups
    .filter((g) => g.decided >= minRuns)
    .sort((a, b) => b.winRate - a.winRate || b.decided - a.decided)
    .slice(0, limit);
}

export interface BossGroup extends WinGroup {
  bossId: number;
  /** floors it was beaten on, most often first */
  floors: CountGroup[];
  /** runs that ended with it killing you */
  killedYou: number;
}

/** Per boss (BossType): in how many runs it was beaten, how those runs went, where, and how often it killed you. */
export function bossGroups(runs: Run[], countQuits: boolean): BossGroup[] {
  const groups = new Map<number, BossGroup>();
  const get = (id: number) => {
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { ...winGroup(String(id), bossName(id)), bossId: id, floors: [], killedYou: 0 }));
    return g;
  };
  for (const r of runs) {
    const seen = new Set<number>();
    for (const f of r.floors) {
      for (const b of f.bosses ?? []) {
        const g = get(b.bossId);
        const label = floorName(f.stage, f.stageType, isGreed(r));
        const fl = g.floors.find((x) => x.label === label);
        if (fl) fl.count++;
        else g.floors.push({ key: label, label, count: 1, order: floorOrder(f.stage, f.stageType) });
        if (!seen.has(b.bossId)) addRun(g, r, countQuits);
        seen.add(b.bossId);
      }
    }
    // the killer is an entity, not a BossType: match it by name
    const k = r.result.type === "death" ? r.result.killedBy : undefined;
    if (k?.boss && k.name) {
      const id = [...groups.keys(), ...BOSS_IDS].find((i) => bossName(i).toLowerCase() === k.name!.toLowerCase());
      if (id !== undefined) get(id).killedYou++;
    }
  }
  const list = finish(groups.values());
  for (const g of list) g.floors.sort((a, b) => b.count - a.count || (a.order ?? 0) - (b.order ?? 0));
  return list;
}

/** Runs split by route: Repentance's alt path (Downpour, Mines, Mausoleum, Corpse...) or the usual floors. Greed runs left out. */
export function pathStats(runs: Run[], countQuits: boolean): WinGroup[] {
  const alt = winGroup("alt", "Alt path");
  const normal = winGroup("normal", "Normal path");
  for (const r of runs) {
    if (isGreed(r)) continue;
    addRun(r.floors.some((f) => f.stageType === 4 || f.stageType === 5) ? alt : normal, r, countQuits);
  }
  return finish([normal, alt]).filter((g) => g.runs > 0);
}

export interface CurseGroup extends WinGroup {
  /** floors it was on */
  floors: number;
  /** deaths on a floor with it */
  deaths: number;
}

/** Per curse: on how many floors and runs it was, how those runs went and how many deaths happened under it. */
export function curseStats(runs: Run[], countQuits: boolean): CurseGroup[] {
  const groups = new Map<string, CurseGroup>();
  for (const r of runs) {
    const seen = new Set<string>();
    r.floors.forEach((f, i) => {
      for (const name of curseNames(f.curses)) {
        let g = groups.get(name);
        if (!g) groups.set(name, (g = { ...winGroup(name, name), floors: 0, deaths: 0 }));
        g.floors++;
        if (r.result.type === "death" && i === r.floors.length - 1) g.deaths++;
        if (!seen.has(name)) addRun(g, r, countQuits);
        seen.add(name);
      }
    });
  }
  return finish(groups.values()).sort((a, b) => b.floors - a.floors || a.label.localeCompare(b.label));
}

export interface PairGroup extends WinGroup {
  a: ItemInfo;
  b: ItemInfo;
}

/** Two items picked up in the same run (starting and later-lost items left out), with at least minRuns decided runs. */
export function itemPairs(runs: Run[], countQuits: boolean, minRuns: number, limit = 15): PairGroup[] {
  const groups = new Map<string, PairGroup>();
  for (const r of runs) {
    const items = new Map<string, ItemInfo>();
    for (const p of r.items) {
      if (p.starting || p.removed) continue;
      const info = itemInfo(p.id, p.name);
      items.set(info.key, info);
    }
    const list = [...items.values()].sort((x, y) => x.key.localeCompare(y.key));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i].key}|${list[j].key}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { ...winGroup(key, `${list[i].name} + ${list[j].name}`), a: list[i], b: list[j] }));
        addRun(g, r, countQuits);
      }
    }
  }
  return finish(groups.values())
    .filter((g) => g.decided >= minRuns && g.wins > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const DEVIL_ROOMS = new Set([14, 22]); // devil room, black market
const ANGEL_ROOMS = new Set([15]);

/** Items picked up (starting ones left out) by the kind of room they were taken in. */
export function itemSources(runs: Run[]): CountGroup[] {
  return [...runs.flatMap((r) => r.items.filter((i) => !i.starting && i.roomType !== undefined))
    .reduce((m, i) => {
      const label = ROOM_TYPES[i.roomType!] ?? `Room type ${i.roomType}`;
      const g = m.get(label) ?? { key: String(i.roomType), label, count: 0 };
      g.count++;
      return m.set(label, g);
    }, new Map<string, CountGroup>()).values()].sort((a, b) => b.count - a.count);
}

/** Runs by the deals taken: devil items (devil room, black market), angel items, both or neither. Greed runs left out. */
export function dealStats(runs: Run[], countQuits: boolean): WinGroup[] {
  const groups = {
    devil: winGroup("devil", "Devil deals"),
    angel: winGroup("angel", "Angel items"),
    both: winGroup("both", "Both"),
    none: winGroup("none", "Neither"),
  };
  for (const r of runs) {
    if (isGreed(r)) continue;
    const taken = r.items.filter((i) => !i.starting);
    const devil = taken.some((i) => DEVIL_ROOMS.has(i.roomType ?? -1));
    const angel = taken.some((i) => ANGEL_ROOMS.has(i.roomType ?? -1));
    addRun(groups[devil && angel ? "both" : devil ? "devil" : angel ? "angel" : "none"], r, countQuits);
  }
  return finish(Object.values(groups)).filter((g) => g.runs > 0);
}

export interface FloorQuality {
  label: string;
  order: number;
  items: number;
  /** average item quality (0-4) of the items with a known quality */
  quality: number;
}

/** Items picked up per floor and their average quality (from the game's items_metadata.xml). */
export function qualityByFloor(runs: Run[]): FloorQuality[] {
  const groups = new Map<string, FloorQuality & { sum: number; rated: number }>();
  for (const r of runs) {
    for (const i of r.items) {
      if (i.starting || i.floor <= 0 && r.partial) continue;
      const f = r.floors[i.floor];
      if (!f) continue;
      const label = floorName(f.stage, f.stageType, isGreed(r));
      const g = groups.get(label) ?? { label, order: floorOrder(f.stage, f.stageType) + (isGreed(r) ? 1000 : 0), items: 0, quality: 0, sum: 0, rated: 0 };
      g.items++;
      const q = itemQuality(i.id);
      if (q !== undefined) { g.sum += q; g.rated++; }
      groups.set(label, g);
    }
  }
  return [...groups.values()]
    .map(({ sum, rated, ...g }) => ({ ...g, quality: rated ? sum / rated : 0 }))
    .sort((a, b) => a.order - b.order);
}

function countBy(runs: Run[], pick: (r: Run) => { key: string; label: string; order?: number } | null): CountGroup[] {
  const groups = new Map<string, CountGroup>();
  for (const r of runs) {
    const k = pick(r);
    if (!k) continue;
    const g = groups.get(k.key);
    if (g) g.count++;
    else groups.set(k.key, { ...k, count: 1 });
  }
  return [...groups.values()];
}

export function deathCauses(runs: Run[]): CountGroup[] {
  return countBy(runs, (r) => {
    if (r.result.type !== "death") return null;
    const label = killerName(r.result.killedBy);
    return { key: label, label };
  }).sort((a, b) => b.count - a.count);
}

export function deathFloors(runs: Run[]): CountGroup[] {
  return countBy(runs, (r) => {
    if (r.result.type !== "death") return null;
    const { stage, stageType } = r.result;
    const label = floorName(stage, stageType, isGreed(r));
    return { key: `${isGreed(r) ? "g" : ""}${stage}.${stageType}`, label, order: floorOrder(stage, stageType) + (isGreed(r) ? 1000 : 0) };
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function endings(runs: Run[]): CountGroup[] {
  return countBy(runs, (r) => {
    if (r.result.type !== "win") return null;
    const label = endingName(r.result.ending);
    return { key: label, label };
  }).sort((a, b) => b.count - a.count);
}

export interface RunRecord {
  label: string;
  value: number;
  kind: "duration" | "count" | "stat" | "streak";
  run: Run;
}

/** Best values over the given runs, each with the run that set it (the first one, on a tie). */
export function records(runs: Run[], countQuits: boolean): RunRecord[] {
  const out: RunRecord[] = [];
  const best = (label: string, kind: RunRecord["kind"], list: Run[], pick: (r: Run) => number | undefined, lowest = false) => {
    let top: { value: number; run: Run } | undefined;
    for (const run of list) {
      const value = pick(run);
      if (value === undefined || !Number.isFinite(value)) continue;
      if (!top || (lowest ? value < top.value : value > top.value)) top = { value, run };
    }
    if (top) out.push({ label, kind, ...top });
  };
  const wins = runs.filter((r) => r.result.type === "win");
  const played = runs.filter((r) => r.result.type === "win" || r.result.type === "death");
  best("Fastest win", "duration", wins, (r) => r.durationFrames, true);
  best("Longest run", "duration", played, (r) => r.durationFrames);
  best("Most items in a run", "count", runs, (r) => r.items.filter((i) => !i.starting).length || undefined);
  best("Highest damage", "stat", runs, (r) => r.stats?.damage);
  best("Highest tears", "stat", runs, (r) => r.stats?.tears);
  best("Highest speed", "stat", runs, (r) => r.stats?.speed);
  best("Highest luck", "stat", runs, (r) => r.stats?.luck);

  // win streak in the order the runs were played; a death ends it, a quit too when quits count
  const ordered = [...runs].filter((r) => r.startedAt).sort((a, b) => a.startedAt!.localeCompare(b.startedAt!));
  let cur = 0;
  let streak: { value: number; run: Run } | undefined;
  for (const r of ordered) {
    if (r.result.type === "win") {
      cur++;
      if (!streak || cur > streak.value) streak = { value: cur, run: r };
    } else if (isDecided(r, countQuits)) cur = 0;
  }
  if (streak && streak.value > 1) out.push({ label: "Longest win streak", kind: "streak", ...streak });
  return out;
}
