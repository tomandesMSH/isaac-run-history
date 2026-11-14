// Tests for the statistics (src/stats/stats.ts) and export parsing. Run with `npm test`: the file
// is bundled by Vite (it resolves the page's imports and JSON) and run by Node's own test runner.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExport, type Run } from "../src/model/schema";
import {
  bossGroups, curseStats, dealStats, itemGroups, itemPairs, itemSources, pathStats, records, summary, trinketGroups,
  winRateByCharacter,
} from "../src/stats/stats";

let n = 0;
type Partial2<T> = { [K in keyof T]?: T[K] };

/** A run with sensible defaults; result as a word, the rest overridable. */
function run(result: Run["result"]["type"], over: Partial2<Run> = {}): Run {
  n++;
  return {
    id: `seed-${n}`, seed: "AAAA AAAA", seedNum: n, character: { id: 0, name: "Isaac" }, difficulty: "normal",
    result: { type: result }, completions: [], floors: [{ stage: 1, stageType: 0, bosses: [] }],
    items: [], trinkets: [], durationFrames: 30 * 60 * 20, ...over,
  } as Run;
}

const item = (id: number, extra: object = {}) => ({ id, name: `Item ${id}`, floor: 0, ...extra });

test("win rate counts wins and deaths, quits only when asked", () => {
  const runs = [run("win"), run("death"), run("quit"), run("unknown")];
  const s = summary(runs, false);
  assert.equal(s.total, 4);
  assert.equal(s.wins, 1);
  assert.equal(s.deaths, 1);
  assert.equal(s.quits, 2);
  assert.equal(s.winRate, 0.5);
  assert.equal(summary(runs, true).winRate, 0.25);
});

test("average run length leaves quick quits out", () => {
  const s = summary([run("win", { durationFrames: 3000 }), run("quit", { durationFrames: 30 })], false);
  assert.equal(s.avgDuration, 3000);
});

test("win rate by character groups by character", () => {
  const azazel = { id: 7, name: "Azazel" };
  const g = winRateByCharacter([run("win", { character: azazel }), run("death", { character: azazel }), run("death")], false);
  const az = g.find((x) => x.label === "Azazel")!;
  assert.equal(az.runs, 2);
  assert.equal(az.winRate, 0.5);
});

test("items count once per run, starting items left out", () => {
  const runs = [
    run("win", { items: [item(118), item(118), item(105, { starting: true })] }),
    run("death", { items: [item(118)] }),
  ];
  const g = itemGroups(runs, false);
  assert.equal(g.length, 1);
  assert.equal(g[0].runs, 2);
  assert.equal(g[0].winRate, 0.5);
});

test("trinkets count golden and smelted runs", () => {
  const runs = [
    run("win", { trinkets: [{ id: 1, name: "Swallowed Penny", floor: 0, golden: true }, { id: 1, name: "Swallowed Penny", floor: 1, smelted: true }] }),
    run("death", { trinkets: [{ id: 1, name: "Swallowed Penny", floor: 0 }] }),
  ];
  const [g] = trinketGroups(runs, false);
  assert.equal(g.runs, 2);
  assert.equal(g.golden, 1);
  assert.equal(g.smelted, 1);
});

test("bosses: runs, floors and deaths matched by name", () => {
  const floors = [{ stage: 1, stageType: 0, bosses: [{ bossId: 1 }] }, { stage: 2, stageType: 0, bosses: [{ bossId: 1 }] }];
  const runs = [
    run("win", { floors }),
    run("death", { floors: [{ stage: 1, stageType: 0, bosses: [] }], result: { type: "death", killedBy: { type: 20, name: "Monstro", boss: true } } }),
  ];
  const monstro = bossGroups(runs, false).find((g) => g.bossId === 1)!;
  assert.equal(monstro.runs, 1, "beaten twice in one run counts one run");
  assert.equal(monstro.floors.reduce((a, f) => a + f.count, 0), 2);
  assert.equal(monstro.killedYou, 1);
});

test("alt path: any Repentance floor puts the run on it; greed runs left out", () => {
  const alt = [{ stage: 1, stageType: 4, bosses: [] }];
  const g = pathStats([run("win", { floors: alt }), run("death"), run("win", { difficulty: "greed" })], false);
  assert.deepEqual(g.map((x) => [x.key, x.runs]), [["normal", 1], ["alt", 1]]);
});

test("curses: floors, deaths on the last floor, runs", () => {
  const floors = [{ stage: 1, stageType: 0, curses: 1, bosses: [] }, { stage: 2, stageType: 0, curses: 1, bosses: [] }];
  const [dark] = curseStats([run("death", { floors })], false);
  assert.match(dark.label, /Darkness/);
  assert.equal(dark.floors, 2);
  assert.equal(dark.deaths, 1);
  assert.equal(dark.runs, 1);
});

test("item pairs need the minimum and a win; lost items left out", () => {
  const both = () => [item(1), item(2), item(3, { removed: true })];
  const runs = [run("win", { items: both() }), run("win", { items: both() }), run("death", { items: [item(1)] })];
  const pairs = itemPairs(runs, false, 2);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].wins, 2);
  assert.equal(itemPairs(runs, false, 3).length, 0);
});

test("item sources and devil/angel deals by room type", () => {
  const runs = [
    run("win", { items: [item(1, { roomType: 14 }), item(2, { roomType: 4 })] }),
    run("death", { items: [item(3, { roomType: 15 }), item(4, { roomType: 22 })] }),
    run("death", { items: [item(5, { roomType: 4 })] }),
  ];
  const src = itemSources(runs);
  assert.equal(src.find((s) => s.label === "Treasure room")?.count, 2);
  const deals = Object.fromEntries(dealStats(runs, false).map((g) => [g.key, g.runs]));
  assert.deepEqual(deals, { devil: 1, both: 1, none: 1 });
});

test("records: fastest win and longest win streak", () => {
  const runs = [
    run("win", { durationFrames: 5000, startedAt: "2026-01-01T00:00:00Z" }),
    run("win", { durationFrames: 4000, startedAt: "2026-01-02T00:00:00Z" }),
    run("death", { startedAt: "2026-01-03T00:00:00Z" }),
  ];
  const r = records(runs, false);
  assert.equal(r.find((x) => /fastest/i.test(x.label))?.value, 4000);
  assert.equal(r.find((x) => x.kind === "streak")?.value, 2);
});

test("parseExport rejects other JSON and reads achievements/challenges", () => {
  assert.throws(() => parseExport("not json"));
  assert.throws(() => parseExport('{"format":"something-else","version":1,"runs":[]}'));
  const p = parseExport(JSON.stringify({
    format: "isaac-run-history", version: 1, saveSlot: 1, runs: [],
    lifetime: { counters: {}, marks: [], bestiary: [], collection: { total: 0, have: [], missing: [] }, achievements: [1, 2], challenges: [] },
  }));
  assert.deepEqual(p.lifetime?.achievements, [1, 2]);
  assert.deepEqual(p.lifetime?.challenges, []);
});
