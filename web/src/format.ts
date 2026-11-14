// Text for runs: characters, results, killers, durations, dates.

import { BOSSES, CHALLENGES, CHARACTERS, VANILLA_MAX_CHARACTER, endingName, floorName, sourcelessDamage } from "./data/game";
import type { Killer, Run } from "./model/schema";

export function isGreed(run: Run): boolean {
  return run.difficulty === "greed" || run.difficulty === "greedier";
}

export function characterKey(run: Run): string {
  return run.character.id <= VANILLA_MAX_CHARACTER ? `c:${run.character.id}` : `m:${run.character.name ?? run.character.id}`;
}

export function characterName(run: Run): string {
  const { id, name } = run.character;
  // Tainted characters share their name with the normal ones in the game's config, so the table wins.
  if (id <= VANILLA_MAX_CHARACTER && CHARACTERS[id]) return CHARACTERS[id];
  return name ?? `Character #${id}`;
}

export function challengeName(run: Run): string | undefined {
  if (!run.challenge) return undefined;
  return CHALLENGES[run.challenge.id] ?? `Challenge #${run.challenge.id}`;
}

export function bossName(id: number): string {
  return BOSSES[id] ?? `Boss #${id}`;
}

export function killerName(k?: Killer): string {
  if (!k) return "Unknown";
  if (k.type === 0) return sourcelessDamage(k.flags);
  if (k.type === 1) return "Yourself";
  if (k.name) return k.name;
  return `Entity ${k.type}.${k.variant ?? 0}`;
}

export function endFloorName(run: Run): string {
  const last = run.floors[run.floors.length - 1];
  return floorName(run.result.stage, run.result.stageType, isGreed(run), last?.curses ?? 0);
}

export const RESULT_LABELS: Record<string, string> = {
  win: "Win",
  death: "Death",
  quit: "Quit",
  unknown: "Unknown",
};

export function resultText(run: Run): string {
  const r = run.result;
  if (r.type === "win") return `Win: ${endingName(r.ending)}`;
  if (r.type === "death") return `Died to ${killerName(r.killedBy)}`;
  if (r.type === "quit") return "Quit / restarted";
  return "Game closed during the run";
}

export function duration(frames?: number): string {
  if (frames === undefined) return "?";
  const s = Math.floor(frames / 30);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function dateTime(iso?: string): string {
  if (!iso) return "?";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function difficultyName(d: string): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Runs newest first; runs without a date keep their import order at the end. */
export function byNewest(a: Run, b: Run): number {
  return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
}
