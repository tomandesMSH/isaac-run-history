// Statistics page.

import { bar, card, countUp, emptyNote, h, itemChip } from "../dom";
import { overTime } from "./charts";
import { characterName, dateTime, duration, percent } from "../format";
import type { Run } from "../model/schema";
import { runsLink } from "../router";
import {
  applyFilters, bestItems, deathCauses, deathFloors, endings, itemGroups, mostPickedItems, records, summary,
  winRateByCharacter, type CountGroup, type ItemGroup, type RunRecord, type StatsOptions,
} from "../stats/stats";

export const defaultStatsOptions: StatsOptions = { difficulty: "all", countQuits: false, minRuns: 5 };

// value: text as is, or a number that counts up shown through fmt
function kpi(label: string, value: string | [number, (n: number) => string], sub?: string): HTMLElement {
  const text = typeof value === "string" ? value : value[1](value[0]);
  const v = h("div", { class: text.length >= 6 ? "kpi-value long" : "kpi-value" });
  if (typeof value === "string") v.textContent = value;
  else countUp(v, value[0], value[1]);
  return h("div", { class: "kpi" },
    h("div", { class: "kpi-label" }, label),
    v,
    sub ? h("div", { class: "kpi-sub" }, sub) : null);
}

function countList(groups: CountGroup[], kind: "death" | "neutral" | "win", empty: string, link?: (g: CountGroup) => string): HTMLElement {
  if (groups.length === 0) return emptyNote(empty);
  const max = Math.max(...groups.map((g) => g.count));
  const total = groups.reduce((a, g) => a + g.count, 0);
  return h("table", { class: "table" },
    h("tbody", null, groups.map((g) =>
      h("tr", null,
        h("th", { scope: "row" }, link ? h("a", { href: link(g) }, g.label) : g.label),
        h("td", { class: "num" }, g.count),
        h("td", { class: "bar-cell" }, bar(g.count / max, percent(g.count / total), kind))))));
}

function itemTable(groups: ItemGroup[], mode: "count" | "winrate", baseline: number): HTMLElement {
  return h("table", { class: "table" },
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, "Item"),
      h("th", { scope: "col", class: "num" }, mode === "count" ? "Runs" : "Won"),
      h("th", { scope: "col" }, "Win rate"))),
    h("tbody", null, groups.map((g) => {
      const diff = g.winRate - baseline;
      return h("tr", null,
        h("th", { scope: "row" }, itemChip(g.item, { href: runsLink({ item: g.item.name }) })),
        h("td", { class: "num" }, mode === "count" ? g.runs : `${g.wins}/${g.decided}`),
        h("td", { class: "bar-cell" }, bar(g.winRate,
          g.decided ? `${percent(g.winRate)}${mode === "winrate" ? ` (${diff >= 0 ? "+" : ""}${Math.round(diff * 100)})` : ""}` : "–", "win")));
    })));
}

function recordValue(r: RunRecord): string {
  if (r.kind === "duration") return duration(r.value);
  if (r.kind === "streak") return `${r.value} wins`;
  if (r.kind === "stat") return String(Math.round(r.value * 100) / 100);
  return String(r.value);
}

// each record is a tile: the value, what it is, and a link to the run that set it
function recordTiles(list: RunRecord[]): HTMLElement {
  if (list.length === 0) return emptyNote("No runs yet.");
  return h("div", { class: "stat-tiles compact records" }, list.map((r) => h("div", { class: "stat-tile" },
    h("div", null,
      h("div", { class: "stat-tile-value" }, recordValue(r)),
      h("div", { class: "stat-tile-label" }, r.label),
      h("a", { class: "stat-tile-label", href: `#/run/${encodeURIComponent(r.run.id)}`, title: dateTime(r.run.startedAt) },
        `${characterName(r.run)}${r.kind === "streak" ? ", last win" : ""} →`)))));
}

export function renderStats(allRuns: Run[], opts: StatsOptions, onChange: (o: StatsOptions) => void): HTMLElement {
  const runs = applyFilters(allRuns, opts);
  const s = summary(runs, opts.countQuits);
  const items = itemGroups(runs, opts.countQuits);

  const controls = h("div", { class: "toolbar" },
    h("label", null, "Difficulty ",
      h("select", { onChange: (e: Event) => onChange({ ...opts, difficulty: (e.target as HTMLSelectElement).value as StatsOptions["difficulty"] }) },
        ["all", "normal", "hard", "greed", "greedier"].map((d) =>
          h("option", { value: d, selected: d === opts.difficulty }, d === "all" ? "All" : d[0].toUpperCase() + d.slice(1))))),
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: opts.countQuits, onChange: (e: Event) => onChange({ ...opts, countQuits: (e.target as HTMLInputElement).checked }) }),
      " Count quits as losses"));

  const kpis = h("div", { class: "kpis" },
    kpi("Runs", [s.total, (n) => String(Math.round(n))], `${s.wins} won · ${s.deaths} died · ${s.quits} quit`),
    kpi("Win rate", s.wins + s.deaths > 0 || opts.countQuits ? [s.winRate, percent] : "–", opts.countQuits ? "quits count as losses" : "wins / (wins + deaths)"),
    kpi("Average run", s.avgDuration !== undefined ? [s.avgDuration, duration] : "–", "wins and deaths, in-game time"),
    kpi("Average win", s.avgWinDuration !== undefined ? [s.avgWinDuration, duration] : "–",
      s.avgDeathDuration !== undefined ? `death after ${duration(s.avgDeathDuration)}` : undefined),
    kpi("Items per run", s.avgItems !== undefined ? [s.avgItems, (n) => n.toFixed(1)] : "–", "picked up, starting items not counted"));

  const chars = winRateByCharacter(runs, opts.countQuits);
  const charTable = chars.length === 0 ? emptyNote("No runs.") : h("table", { class: "table" },
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, "Character"),
      h("th", { scope: "col", class: "num" }, "Runs"),
      h("th", { scope: "col", class: "num" }, "Won"),
      h("th", { scope: "col" }, "Win rate"))),
    h("tbody", null, chars.map((g) => h("tr", null,
      h("th", { scope: "row" }, h("a", { href: runsLink({ char: g.key }) }, g.label)),
      h("td", { class: "num" }, g.runs),
      h("td", { class: "num" }, `${g.wins}/${g.decided}`),
      h("td", { class: "bar-cell" }, bar(g.winRate, g.decided ? percent(g.winRate) : "–", "win"))))));

  const minInput = h("input", {
    type: "number", min: 1, max: 100, value: String(opts.minRuns), class: "input-small", "aria-label": "Minimum runs",
    onChange: (e: Event) => onChange({ ...opts, minRuns: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }),
  });
  const best = bestItems(items, opts.minRuns);
  const most = mostPickedItems(items);

  return h("div", { class: "page" },
    h("div", { class: "page-head" }, h("h1", null, "Statistics"), controls),
    h("p", { class: "page-note" }, "Only runs recorded since you installed the mod show here. For your whole save's totals, see ",
      h("a", { href: "#/lifetime" }, "Lifetime"), "."),
    kpis,
    card("Personal records", recordTiles(records(runs, opts.countQuits)), { wide: true }),
    card("Over time", overTime(runs, opts.countQuits), { wide: true, note: "Hover a bar, point or day for the numbers." }),
    h("div", { class: "grid" },
      card("Win rate by character", charTable),
      card("Endings", countList(endings(runs), "win", "No wins yet.", () => runsLink({ result: "win" }))),
      card("Most picked items", most.length ? itemTable(most, "count", s.winRate) : emptyNote("No items picked up yet."),
        { note: "Runs the item was picked up in. Starting items aren't counted." }),
      card("Best items by win rate",
        best.length ? itemTable(best, "winrate", s.winRate) : emptyNote(`No item has been in ${opts.minRuns}+ decided runs yet.`),
        { note: h("span", null, "Items picked up in at least ", minInput, " decided runs. In brackets: difference from your overall win rate.") }),
      card("Causes of death", countList(deathCauses(runs).slice(0, 15), "death", "No deaths. Nice.")),
      card("Floor of death", countList(deathFloors(runs), "death", "No deaths. Nice."))));
}
