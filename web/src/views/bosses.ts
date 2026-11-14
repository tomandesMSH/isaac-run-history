// Bosses page: every boss with the versus screen's portrait and name (from the game files:
// data/bosses.json), and from recorded runs how often you beat it, where, how those runs went and
// how often it killed you.

import bossData from "../data/bosses.json";
import { emptyNote, h, wikiLink } from "../dom";
import { duration, percent } from "../format";
import type { Run } from "../model/schema";
import { runsLink } from "../router";
import { bossGroups, type BossGroup } from "../stats/stats";

interface Known { id: number; name: string; portrait?: [number, number]; nameImg?: [number, number] }
interface Entry extends Known { group?: BossGroup }

type Sort = "met" | "winrate" | "deadly" | "id" | "name";
type Show = "met" | "all";

const SORTS: [Sort, string][] = [
  ["met", "Most beaten"], ["winrate", "Win rate"], ["deadly", "Killed you most"], ["id", "Game order"], ["name", "Name (A–Z)"],
];
const SHOWS: [Show, string][] = [["met", "Beaten"], ["all", "All"]];

const view: { sort: Sort; show: Show; query: string } = { sort: "met", show: "met", query: "" };

function sorted(list: Entry[]): Entry[] {
  const by: Record<Sort, (a: Entry, b: Entry) => number> = {
    met: (a, b) => (b.group?.runs ?? 0) - (a.group?.runs ?? 0) || a.id - b.id,
    winrate: (a, b) => (b.group?.decided ? b.group.winRate : -1) - (a.group?.decided ? a.group.winRate : -1)
      || (b.group?.decided ?? 0) - (a.group?.decided ?? 0) || a.id - b.id,
    deadly: (a, b) => (b.group?.killedYou ?? 0) - (a.group?.killedYou ?? 0) || (b.group?.runs ?? 0) - (a.group?.runs ?? 0) || a.id - b.id,
    id: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const q = view.query.trim().toLowerCase();
  return list
    .filter((e) => view.show === "all" || e.group)
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .sort(by[view.sort]);
}

function tile(e: Entry, gfx: boolean): HTMLElement {
  const g = e.group;
  const lines = g ? [
    `beaten in ${g.runs} run${g.runs === 1 ? "" : "s"}${g.decided ? ` · ${percent(g.winRate)} won` : ""}`,
    g.floors.slice(0, 2).map((f) => `${f.label}${f.count > 1 ? ` ×${f.count}` : ""}`).join(", "),
    g.avgKillFrames !== undefined ? `floor cleared to it in ~${duration(g.avgKillFrames)}` : "",
  ] : ["not beaten in a recorded run"];
  return h("div", { class: `boss${g ? "" : " missing"}` },
    h("a", {
      class: "boss-main",
      href: g ? runsLink({ boss: String(e.id) }) : undefined,
      title: g ? `${e.name}: show the runs` : e.name,
    },
    h("div", { class: "boss-portrait" },
      gfx && e.portrait ? h("img", { src: `gfx/bosses/${e.id}.png`, alt: "", loading: "lazy", width: e.portrait[0], height: e.portrait[1] }) : null),
    gfx && e.nameImg
      ? h("img", { class: "boss-nameimg", src: `gfx/bosses/${e.id}-name.png`, alt: e.name, loading: "lazy", width: e.nameImg[0], height: e.nameImg[1] })
      : h("div", { class: "collect-name" }, e.name),
    lines.map((l) => (l ? h("div", { class: "collect-meta" }, l) : null)),
    g?.killedYou ? h("div", { class: "boss-killed" }, `killed you ${g.killedYou}×`) : null),
    wikiLink(e.name));
}

export function renderBosses(runs: Run[], countQuits: boolean): HTMLElement {
  const groups = new Map(bossGroups(runs, countQuits).map((g) => [g.bossId, g]));
  const known = bossData as Known[];
  // bosses the page doesn't know (mods) still show up with their name from the export
  const all: Entry[] = [
    ...known.map((k) => ({ ...k, group: groups.get(k.id) })),
    ...[...groups.values()].filter((g) => !known.some((k) => k.id === g.bossId)).map((g) => ({ id: g.bossId, name: g.label, group: g })),
  ];
  const beaten = all.filter((e) => e.group).length;
  const gfx = document.body.classList.contains("has-gfx");
  const grid = h("div", { class: "boss-grid" });
  const count = h("span", { class: "muted" });

  const draw = () => {
    const list = sorted(all);
    count.textContent = `${list.length} shown`;
    grid.replaceChildren(...(list.length ? list.map((e) => tile(e, gfx)) : [emptyNote("Nothing matches.")]));
  };

  const select = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void) =>
    h("label", null, `${label} `, h("select", { onChange: (e: Event) => { set((e.target as HTMLSelectElement).value as T); draw(); } },
      options.map(([v, text]) => h("option", { value: v, selected: v === value }, text))));

  const controls = h("div", { class: "toolbar" },
    select("Sort", SORTS, view.sort, (v) => { view.sort = v; }),
    select("Show", SHOWS, view.show, (v) => { view.show = v; }),
    h("input", {
      type: "search", placeholder: "Find…", value: view.query, class: "input-search", "aria-label": "Find a boss",
      onInput: (e: Event) => { view.query = (e.target as HTMLInputElement).value; draw(); },
    }),
    count);

  draw();
  return h("div", { class: "page" },
    h("p", null, h("a", { href: "#/stats", class: "back" }, "← Statistics")),
    h("div", { class: "page-head" }, h("h1", null, "Bosses"), h("span", { class: "muted" }, `${beaten} of ${known.length} beaten`)),
    h("p", { class: "page-note" }, "From recorded runs: the bosses you beat, on which floors and how those runs ended. Click one to see the runs."),
    controls,
    h("section", { class: "card card-wide" }, grid));
}
