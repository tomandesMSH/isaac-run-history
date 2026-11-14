// Achievements page: every achievement with the game's picture and how to get it (from the game
// files: data/achievements.json), unlocked or not (lifetime export from mod 1.2+).

import achievementData from "../data/achievements.json";
import { emptyNote, h } from "../dom";
import type { Lifetime } from "../model/schema";

interface Known { id: number; name: string; text: string; how?: string; img?: boolean }
interface Entry extends Known { unlocked?: boolean }

type Sort = "id" | "name";
type Show = "all" | "unlocked" | "locked";

const SORTS: [Sort, string][] = [["id", "Game order"], ["name", "Name (A–Z)"]];
const SHOWS: [Show, string][] = [["all", "All"], ["unlocked", "Unlocked"], ["locked", "Locked"]];

const view: { sort: Sort; show: Show; query: string } = { sort: "id", show: "all", query: "" };

function sorted(list: Entry[]): Entry[] {
  const q = view.query.trim().toLowerCase();
  return list
    .filter((e) => view.show === "all" || (view.show === "unlocked") === !!e.unlocked)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.text.toLowerCase().includes(q)
      || (e.how ?? "").toLowerCase().includes(q) || String(e.id) === q)
    .sort(view.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.id - b.id);
}

function achievement(e: Entry): HTMLElement {
  const gfx = document.body.classList.contains("has-gfx");
  return h("div", { class: `ach${e.unlocked === false ? " locked" : ""}`, title: `#${e.id}` },
    gfx && e.img ? h("img", { class: "ach-img", src: `gfx/achievements/${e.id}.png`, alt: e.text, loading: "lazy", width: 263, height: 176 }) : null,
    h("div", { class: "ach-name" }, e.name, e.unlocked === false ? h("span", { class: "ach-lock" }, " · locked") : null),
    e.how ? h("div", { class: "ach-how" }, e.how) : null);
}

/** How many achievements a lifetime export has unlocked, or undefined before mod 1.2. */
export function achievementCount(l: Lifetime): { unlocked: number; total: number } | undefined {
  if (!l.achievements) return undefined;
  const ids = new Set(l.achievements);
  const all = achievementData as Known[];
  return { unlocked: all.filter((a) => ids.has(a.id)).length, total: all.length };
}

export function renderAchievements(lifetimes: Lifetime[], slot: string | undefined): HTMLElement {
  const l = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot)).find((x) => x.slot === slot) ?? lifetimes[0];
  const ids = l?.achievements ? new Set(l.achievements) : undefined;
  const all: Entry[] = (achievementData as Known[]).map((a) => ({ ...a, unlocked: ids ? ids.has(a.id) : undefined }));
  const unlocked = all.filter((e) => e.unlocked).length;
  const grid = h("div", { class: "ach-grid" });
  const count = h("span", { class: "muted" });
  if (!ids) view.show = "all";

  const draw = () => {
    const list = sorted(all);
    count.textContent = `${list.length} shown`;
    grid.replaceChildren(...(list.length ? list.map(achievement)
      : [emptyNote(view.show === "locked" ? "Everything unlocked. 1000000%." : "Nothing matches.")]));
  };

  const select = <T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void) =>
    h("label", null, `${label} `, h("select", { onChange: (e: Event) => { set((e.target as HTMLSelectElement).value as T); draw(); } },
      options.map(([v, text]) => h("option", { value: v, selected: v === value }, text))));

  const controls = h("div", { class: "toolbar" },
    select("Sort", SORTS, view.sort, (v) => { view.sort = v; }),
    ids ? select("Show", SHOWS, view.show, (v) => { view.show = v; }) : null,
    h("input", {
      type: "search", placeholder: "Find…", value: view.query, class: "input-search", "aria-label": "Find an achievement",
      onInput: (e: Event) => { view.query = (e.target as HTMLInputElement).value; draw(); },
    }),
    count);

  draw();
  return h("div", { class: "page" },
    h("p", null, h("a", { href: "#/lifetime", class: "back" }, "← Lifetime")),
    h("div", { class: "page-head" }, h("h1", null, "Achievements"),
      ids ? h("span", { class: "muted" }, `${unlocked} of ${all.length} unlocked`) : null),
    h("p", { class: "page-note" }, ids
      ? "Unlocked comes from your save. Locked ones show how to get them."
      : "Which ones you have needs Isaac Run History 1.2 or newer: update the mod, play or open a run, and import the new export."),
    controls,
    h("section", { class: "card card-wide" }, grid));
}
