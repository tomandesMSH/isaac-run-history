// Item collection page: every item a save can collect, with its quality and pools (from the game
// files: data/collection.json), whether the save has it (lifetime export) and how runs with it went
// (recorded runs).

import collectionData from "../data/collection.json";
import { itemInfo } from "../data/items";
import { emptyNote, h } from "../dom";
import { percent } from "../format";
import type { Lifetime, Run } from "../model/schema";
import { runsLink } from "../router";
import { itemGroups, type ItemGroup } from "../stats/stats";

interface Known { id: number; name: string; kind: string; quality?: number; pools?: string[] }

interface Entry extends Known {
  /** true: in the save's collection, false: missing, undefined: no lifetime data */
  have?: boolean;
  group?: ItemGroup;
}

type Sort = "id" | "name" | "quality" | "picked" | "winrate";
type Show = "all" | "have" | "missing";

const SORTS: [Sort, string][] = [
  ["id", "Game order"], ["name", "Name (A–Z)"], ["quality", "Quality"], ["picked", "Most picked"], ["winrate", "Win rate"],
];
const SHOWS: [Show, string][] = [["all", "All"], ["have", "In collection"], ["missing", "Missing"]];
const POOLS: string[] = collectionData.pools;

const view: { sort: Sort; show: Show; pool: string; query: string } = { sort: "id", show: "all", pool: "", query: "" };

function entries(l: Lifetime | undefined, runs: Run[], countQuits: boolean): Entry[] {
  const have = new Set(l?.collection.have ?? []);
  const missing = new Set((l?.collection.missing ?? []).map((m) => m.id));
  const groups = new Map(itemGroups(runs, countQuits).map((g) => [g.item.key, g]));
  return (collectionData.items as Known[])
    // items the game doesn't count toward the collection (neither had nor missing) are left out
    .filter((k) => !l || have.has(k.id) || missing.has(k.id))
    .map((k) => ({ ...k, have: l ? have.has(k.id) : undefined, group: groups.get(itemInfo(k.id).key) }));
}

function sorted(list: Entry[]): Entry[] {
  const by: Record<Sort, (a: Entry, b: Entry) => number> = {
    id: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name),
    quality: (a, b) => (b.quality ?? -1) - (a.quality ?? -1) || a.id - b.id,
    picked: (a, b) => (b.group?.runs ?? 0) - (a.group?.runs ?? 0) || a.id - b.id,
    winrate: (a, b) => (b.group?.decided ? b.group.winRate : -1) - (a.group?.decided ? a.group.winRate : -1)
      || (b.group?.decided ?? 0) - (a.group?.decided ?? 0) || a.id - b.id,
  };
  const q = view.query.trim().toLowerCase();
  return list
    .filter((e) => view.show === "all" || (view.show === "have") === (e.have !== false))
    .filter((e) => !view.pool || e.pools?.includes(view.pool))
    .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.id) === q)
    .sort(by[view.sort]);
}

function tile(e: Entry): HTMLElement {
  const info = itemInfo(e.id, e.name);
  const g = e.group;
  return h("a", {
    class: `collect${e.have === false ? " missing" : ""}`,
    href: g ? runsLink({ item: e.name }) : undefined,
    title: `${e.name} (#${e.id})${e.pools?.length ? `\nPools: ${e.pools.join(", ")}` : ""}`,
  },
  info.icon ? h("img", { class: "collect-icon", src: info.icon, alt: "", loading: "lazy", width: 64, height: 64 }) : h("span", { class: "collect-icon" }),
  h("div", { class: "collect-name" }, e.name),
  h("div", { class: "collect-meta" },
    e.quality !== undefined ? h("span", { class: `quality q${e.quality}` }, `Q${e.quality}`) : null,
    g ? ` ${g.runs} run${g.runs === 1 ? "" : "s"}${g.decided ? ` · ${percent(g.winRate)} won` : ""}` : null),
  e.have === false ? h("div", { class: "collect-missing" }, "not collected") : null);
}

export function renderItems(lifetimes: Lifetime[], slot: string | undefined, runs: Run[], countQuits: boolean): HTMLElement {
  const l = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot)).find((x) => x.slot === slot) ?? lifetimes[0];
  const all = entries(l, runs, countQuits);
  const have = all.filter((e) => e.have).length;
  const grid = h("div", { class: "collect-grid" });
  const count = h("span", { class: "muted" });

  const draw = () => {
    const list = sorted(all);
    count.textContent = `${list.length} shown`;
    grid.replaceChildren(...(list.length ? list.map(tile)
      : [emptyNote(view.show === "missing" ? "Nothing missing. You have them all." : "Nothing matches.")]));
  };

  const select = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void) =>
    h("label", null, `${label} `, h("select", { onChange: (e: Event) => { set((e.target as HTMLSelectElement).value as T); draw(); } },
      options.map(([v, text]) => h("option", { value: v, selected: v === value }, text))));

  const controls = h("div", { class: "toolbar" },
    select("Sort", SORTS, view.sort, (v) => { view.sort = v; }),
    l ? select("Show", SHOWS, view.show, (v) => { view.show = v; }) : null,
    select("Pool", [["", "Any"], ...POOLS.map((p): [string, string] => [p, p])], view.pool, (v) => { view.pool = v; }),
    h("input", {
      type: "search", placeholder: "Find…", value: view.query, class: "input-search", "aria-label": "Find an item by name or number",
      onInput: (e: Event) => { view.query = (e.target as HTMLInputElement).value; draw(); },
    }),
    count);

  draw();
  return h("div", { class: "page" },
    h("p", null, h("a", { href: "#/lifetime", class: "back" }, "← Lifetime")),
    h("div", { class: "page-head" }, h("h1", null, "Items"),
      l ? h("span", { class: "muted" }, `${have} of ${all.length} collected`) : null),
    h("p", { class: "page-note" }, "Collected comes from your save. Runs and win rate are from recorded runs; click an item to see them."),
    controls,
    h("section", { class: "card card-wide" }, grid));
}
