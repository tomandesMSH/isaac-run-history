// Bestiary page: every enemy and boss the game's bestiary counts, met or not, with the death
// screen's ink portrait. The full list comes from the game files (tools/extract_assets.py writes
// data/bestiary.json); the counts come from the lifetime export, which only lists what you've met.

import bestiaryList from "../data/bestiary.json";
import { card, emptyNote, h } from "../dom";
import type { Lifetime } from "../model/schema";

interface Known { type: number; variant: number; name: string; boss?: boolean; sheet?: "enemy" | "boss"; x?: number; y?: number }

interface Entry extends Known {
  order: number;
  met: boolean;
  kills: number;
  deaths: number;
  encounters: number;
}

type Sort = "game" | "name" | "kills" | "deaths" | "encounters";
type Show = "all" | "met" | "unmet";

const SORTS: [Sort, string][] = [
  ["game", "Game order"], ["name", "Name (A–Z)"], ["kills", "Most killed"], ["deaths", "Killed you most"], ["encounters", "Most met"],
];
const SHOWS: [Show, string][] = [["all", "All"], ["met", "Met"], ["unmet", "Not met yet"]];

// kept between visits, so coming back from Lifetime keeps the same view
const view: { sort: Sort; show: Show; query: string } = { sort: "game", show: "all", query: "" };

function entries(l: Lifetime): Entry[] {
  const counts = new Map(l.bestiary.map((e) => [`${e.type}.${e.variant}`, e]));
  const list: Entry[] = (bestiaryList as Known[]).map((k, order) => {
    const c = counts.get(`${k.type}.${k.variant}`);
    counts.delete(`${k.type}.${k.variant}`);
    return { ...k, order, met: !!c, kills: c?.kills ?? 0, deaths: c?.deaths ?? 0, encounters: c?.encounters ?? 0 };
  });
  // anything the export has that the game list doesn't (a mod's enemies) still shows, at the end
  for (const c of counts.values()) {
    list.push({ type: c.type, variant: c.variant, name: c.name && !c.name.startsWith("#") ? c.name : `Entity ${c.type}.${c.variant}`,
      order: 100000 + c.type * 100 + c.variant, met: true, kills: c.kills, deaths: c.deaths, encounters: c.encounters });
  }
  // Parts, projectiles and other forms (necks, Mom's foot, Envy's smaller heads...) aren't counted
  // on their own: they have no portrait, or share it with the enemy they belong to. They only show
  // once met.
  const metPortraits = new Set(list.filter((e) => e.met && e.sheet).map((e) => `${e.sheet}:${e.x}:${e.y}`));
  return list.filter((e) => e.met || (e.sheet && !metPortraits.has(`${e.sheet}:${e.x}:${e.y}`)));
}

function sorted(list: Entry[]): Entry[] {
  const by: Record<Sort, (a: Entry, b: Entry) => number> = {
    game: (a, b) => a.order - b.order,
    name: (a, b) => a.name.localeCompare(b.name),
    kills: (a, b) => b.kills - a.kills || a.order - b.order,
    deaths: (a, b) => b.deaths - a.deaths || a.order - b.order,
    encounters: (a, b) => b.encounters - a.encounters || a.order - b.order,
  };
  const q = view.query.trim().toLowerCase();
  return list
    .filter((e) => (view.show === "all" || (view.show === "met") === e.met) && (!q || e.name.toLowerCase().includes(q)))
    .sort(by[view.sort]);
}

function portrait(e: Entry): HTMLElement {
  if (!e.sheet || !document.body.classList.contains("has-gfx")) return h("div", { class: "beast-portrait empty" });
  return h("div", {
    class: "beast-portrait",
    style: `background-image: url("gfx/bestiary/${e.sheet}.png"); background-position: -${(e.x ?? 0) * 2}px -${(e.y ?? 0) * 2}px;`
      + ` background-size: ${e.sheet === "boss" ? 896 : 2048}px auto;`,
  });
}

function beast(e: Entry): HTMLElement {
  const n = (v: number) => v.toLocaleString();
  return h("div", { class: `beast${e.met ? "" : " unmet"}${e.boss ? " boss" : ""}`, title: `${e.name} (${e.type}.${e.variant})` },
    portrait(e),
    h("div", { class: "beast-name" }, e.name),
    e.met
      ? h("div", { class: "beast-counts" },
        h("span", { title: "times you killed it" }, `${n(e.kills)} killed`),
        e.deaths ? h("span", { class: "beast-deaths", title: "times it killed you" }, `killed you ${n(e.deaths)}×`) : null,
        h("span", { title: "times you met it" }, `met ${n(e.encounters)}×`))
      : h("div", { class: "beast-counts" }, "not met yet"));
}

export function renderBestiary(lifetimes: Lifetime[], slot: string | undefined): HTMLElement {
  const back = h("p", null, h("a", { href: "#/lifetime", class: "back" }, "← Lifetime"));
  if (lifetimes.length === 0) {
    return h("div", { class: "page" }, back, h("div", { class: "page-head" }, h("h1", null, "Bestiary")),
      card("No lifetime stats yet", emptyNote("Import an export from mod version 1.1 or newer.")));
  }
  const l = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot)).find((x) => x.slot === slot) ?? lifetimes[0];
  const all = entries(l);
  const met = all.filter((e) => e.met).length;
  const grid = h("div", { class: "beast-grid" });
  const count = h("span", { class: "muted" });

  const draw = () => {
    const list = sorted(all);
    count.textContent = `${list.length} shown`;
    grid.replaceChildren(...(list.length ? list.map(beast) : [emptyNote(view.show === "unmet" ? "You've met everything. Nothing left to meet." : "Nothing matches.")]));
  };

  const select = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void) =>
    h("label", null, `${label} `, h("select", { onChange: (e: Event) => { set((e.target as HTMLSelectElement).value as T); draw(); } },
      options.map(([v, text]) => h("option", { value: v, selected: v === value }, text))));

  const controls = h("div", { class: "toolbar" },
    select("Sort", SORTS, view.sort, (v) => { view.sort = v; }),
    select("Show", SHOWS, view.show, (v) => { view.show = v; }),
    h("input", {
      type: "search", placeholder: "Find…", value: view.query, class: "input-search", "aria-label": "Find an enemy by name",
      onInput: (e: Event) => { view.query = (e.target as HTMLInputElement).value; draw(); },
    }),
    count);

  draw();
  return h("div", { class: "page" },
    back,
    h("div", { class: "page-head" }, h("h1", null, "Bestiary"),
      h("span", { class: "muted" }, `${met} of ${all.length} met${l.slot !== "?" ? ` · save slot ${l.slot}` : ""}`)),
    h("p", { class: "page-note" }, "Game order is the order the game lists them in, roughly by chapter. ",
      "The game doesn't remember when you first met something."),
    controls,
    h("section", { class: "card card-wide" }, grid));
}
