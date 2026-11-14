// List of all runs with filters (character, result, difficulty, item).

import { itemInfo, trinketInfo } from "../data/items";
import { clear, emptyNote, h, resultBadge } from "../dom";
import {
  bossName, byNewest, challengeName, characterKey, characterName, dateTime, difficultyName, duration, endFloorName, resultText,
} from "../format";
import type { Run } from "../model/schema";
import { runLink, runsLink, type RunFilters } from "../router";

function matches(run: Run, f: RunFilters): boolean {
  if (f.char && characterKey(run) !== f.char) return false;
  if (f.result && run.result.type !== f.result) return false;
  if (f.difficulty && run.difficulty !== f.difficulty) return false;
  if (f.challenge && String(run.challenge?.id ?? "") !== f.challenge) return false;
  if (f.boss && !run.floors.some((fl) => (fl.bosses ?? []).some((b) => String(b.bossId) === f.boss))) return false;
  // "Brimstone + Tammy's Head": every part has to be in the run
  for (const part of (f.item ?? "").split(" + ")) {
    const needle = part.trim().toLowerCase();
    if (!needle) continue;
    const has = run.items.some((i) => itemInfo(i.id, i.name).name.toLowerCase().includes(needle))
      || run.trinkets.some((t) => trinketInfo(t.id, t.name).name.toLowerCase().includes(needle));
    if (!has) return false;
  }
  return true;
}

function row(run: Run): HTMLElement {
  const picked = run.items.filter((i) => !i.starting).length;
  const challenge = challengeName(run);
  const go = () => (location.hash = runLink(run.id));
  return h("tr", { class: "row-link", onClick: go },
    h("td", null, h("a", { href: runLink(run.id) }, dateTime(run.startedAt))),
    h("td", null, characterName(run), challenge ? h("div", { class: "muted small" }, challenge) : null),
    h("td", null, difficultyName(run.difficulty)),
    h("td", null, resultBadge(run), " ", h("span", { class: "small" }, resultText(run))),
    h("td", null, endFloorName(run)),
    h("td", { class: "num" }, duration(run.durationFrames)),
    h("td", { class: "num" }, picked));
}

export function renderRuns(allRuns: Run[], initial: RunFilters): HTMLElement {
  const filters: RunFilters = { ...initial };
  const runs = [...allRuns].sort(byNewest);

  // characters present in the data, most played first
  const chars = new Map<string, { label: string; n: number }>();
  for (const r of runs) {
    const k = characterKey(r);
    const c = chars.get(k);
    if (c) c.n++;
    else chars.set(k, { label: characterName(r), n: 1 });
  }
  const bosses = new Map<string, string>();
  for (const r of runs) for (const fl of r.floors) for (const b of fl.bosses ?? []) bosses.set(String(b.bossId), bossName(b.bossId));
  const itemNames = new Set<string>();
  for (const r of runs) for (const i of r.items) itemNames.add(itemInfo(i.id, i.name).name);
  for (const r of runs) for (const t of r.trinkets) itemNames.add(trinketInfo(t.id, t.name).name);

  const tbody = h("tbody");
  const count = h("p", { class: "muted", "aria-live": "polite" });

  const update = () => {
    const list = runs.filter((r) => matches(r, filters));
    count.textContent = `${list.length} of ${runs.length} runs`;
    clear(tbody, list.length ? list.map(row) : h("tr", null, h("td", { colspan: 7 }, emptyNote("No runs match these filters."))));
    history.replaceState(null, "", runsLink(filters));
  };

  const select = (key: keyof RunFilters, label: string, options: [string, string][]) =>
    h("label", null, `${label} `,
      h("select", { onChange: (e: Event) => { filters[key] = (e.target as HTMLSelectElement).value || undefined; update(); } },
        h("option", { value: "" }, "All"),
        options.map(([v, l]) => h("option", { value: v, selected: filters[key] === v }, l))));

  const itemInput = h("input", {
    type: "search", list: "item-names", placeholder: "e.g. Brimstone", value: filters.item ?? "",
    onInput: (e: Event) => { filters.item = (e.target as HTMLInputElement).value.trim() || undefined; update(); },
  });

  const toolbar = h("div", { class: "toolbar" },
    select("char", "Character", [...chars].sort((a, b) => b[1].n - a[1].n).map(([k, c]) => [k, `${c.label} (${c.n})`])),
    select("result", "Result", [["win", "Win"], ["death", "Death"], ["quit", "Quit"], ["unknown", "Unknown"]]),
    select("difficulty", "Difficulty", [["normal", "Normal"], ["hard", "Hard"], ["greed", "Greed"], ["greedier", "Greedier"]]),
    select("boss", "Boss", [...bosses].sort((a, b) => a[1].localeCompare(b[1]))),
    h("label", null, "Item or trinket ", itemInput),
    h("datalist", { id: "item-names" }, [...itemNames].sort().map((n) => h("option", { value: n }))));

  const table = h("div", { class: "table-wrap" }, h("table", { class: "table table-runs" },
    h("thead", null, h("tr", null,
      ["Date", "Character", "Difficulty", "Result", "Last floor", "Time", "Items"].map((c, i) =>
        h("th", { scope: "col", class: i >= 5 ? "num" : undefined }, c)))),
    tbody));

  update();
  return h("div", { class: "page" }, h("div", { class: "page-head" }, h("h1", null, "Runs"), count), toolbar, table);
}
