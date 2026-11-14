// Statistics over runs. Pure functions: runs in, numbers out.
//
// Win rate = wins / decided runs. A run is decided when it was won or lost (died); quits and runs
// cut short by a crash don't count unless countQuits is on, then they count as losses.

import { endingName, floorName, floorOrder } from "../data/game";
import { itemInfo, type ItemInfo } from "../data/items";
import { characterKey, characterName, isGreed, killerName } from "../format";
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

export function mostPickedItems(groups: ItemGroup[], limit = 20): ItemGroup[] {
  return [...groups].sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label)).slice(0, limit);
}

export function bestItems(groups: ItemGroup[], minRuns: number, limit = 20): ItemGroup[] {
  return groups
    .filter((g) => g.decided >= minRuns)
    .sort((a, b) => b.winRate - a.winRate || b.decided - a.decided)
    .slice(0, limit);
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
