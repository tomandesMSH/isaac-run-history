// Challenges page: every challenge with its rules (from the game files: data/challenges.json),
// whether the save has finished it (lifetime export from mod 1.3+), the recorded attempts and what
// beating it unlocks.

import achievementData from "../data/achievements.json";
import challengeData from "../data/challenges.json";
import { CHALLENGES, CHARACTERS, ROOM_TYPES, curseNames } from "../data/game";
import { itemInfo, trinketInfo } from "../data/items";
import { emptyNote, h, itemChip } from "../dom";
import type { Lifetime, Run } from "../model/schema";
import { runsLink } from "../router";

interface Named { id: number; name: string }

interface Known {
  id: number; name: string; player: number; endStage: number;
  items?: Named[]; trinkets?: Named[]; noRooms?: number[]; curses?: number; noCurses?: number;
  altPath?: boolean; secretPath?: boolean; noShooting?: boolean; unlocks?: number[];
}

type Show = "all" | "done" | "todo";
const SHOWS: [Show, string][] = [["all", "All"], ["done", "Finished"], ["todo", "Not finished"]];
const view: { show: Show; query: string } = { show: "all", query: "" };

const ACHIEVEMENTS = new Map((achievementData as { id: number; name: string; img?: boolean }[]).map((a) => [a.id, a]));

/** What beating it means: the boss at its last floor. */
function goal(c: Known): string {
  switch (c.endStage) {
    case 6: return "Beat Mom";
    case 8: return c.secretPath ? "Beat Mother" : "Beat Mom's Heart";
    case 9: return "Beat Hush";
    case 10: return c.altPath ? "Beat Isaac" : "Beat Satan";
    case 11: return c.altPath ? "Beat ???" : "Beat The Lamb";
    case 12: return "Beat Delirium";
    case 13: return "Beat The Beast";
    default: return c.endStage ? `Clear floor ${c.endStage}` : "";
  }
}

// challenge 45 is an unnamed leftover ("DELETE THIS") the game doesn't list
function known(): Known[] {
  return (challengeData as Known[]).filter((c) => c.name);
}

function rules(c: Known): HTMLElement[] {
  const out: HTMLElement[] = [];
  const line = (label: string, ...body: (Node | string)[]) =>
    out.push(h("div", { class: "chal-rule" }, h("span", { class: "chal-rule-label" }, `${label} `), ...body));
  if (c.items?.length || c.trinkets?.length) {
    line("Start with",
      ...(c.items ?? []).map((i) => itemChip(itemInfo(i.id, i.name), { href: runsLink({ item: i.name }) })),
      ...(c.trinkets ?? []).map((t) => itemChip(trinketInfo(t.id, t.name), { badges: ["trinket"] })));
  }
  const forced = curseNames(c.curses);
  if (forced.length) line("Curses", forced.join(", "));
  if (c.noRooms?.length) line("No", c.noRooms.map((r) => ROOM_TYPES[r] ?? `room ${r}`).join(", "));
  if (c.noShooting) line("Can't shoot", "");
  return out;
}

function card(c: Known, done: boolean | undefined, runs: Run[]): HTMLElement {
  const tries = runs.filter((r) => r.challenge?.id === c.id);
  const wins = tries.filter((r) => r.result.type === "win").length;
  const name = CHALLENGES[c.id] && CHALLENGES[c.id] !== "DELETE THIS" ? CHALLENGES[c.id] : c.name;
  const gfx = document.body.classList.contains("has-gfx");
  return h("article", { class: `chal${done === false ? " todo" : ""}${done ? " done" : ""}` },
    h("header", { class: "chal-head" },
      h("span", { class: "chal-num" }, `#${c.id}`),
      h("h3", null, name),
      done !== undefined ? h("span", { class: `chip ${done ? "chip-done" : "chip-todo"}` }, done ? "finished" : "not finished") : null),
    h("div", { class: "chal-meta" },
      `${CHARACTERS[c.player] ?? `Character #${c.player}`} · ${goal(c)}`),
    ...rules(c),
    tries.length
      ? h("div", { class: "chal-rule" }, h("a", { href: runsLink({ challenge: String(c.id) }) },
        `${tries.length} recorded attempt${tries.length === 1 ? "" : "s"}, ${wins} won →`))
      : null,
    c.unlocks?.length
      ? h("div", { class: "chal-unlocks" }, h("span", { class: "chal-rule-label" }, "Unlocks "),
        c.unlocks.map((id) => {
          const a = ACHIEVEMENTS.get(id);
          return h("span", { class: "chal-unlock", title: a?.name ?? `#${id}` },
            gfx && a?.img ? h("img", { src: `gfx/achievements/${id}.png`, alt: "", loading: "lazy", width: 66, height: 44 }) : null,
            h("span", null, a?.name ?? `Achievement #${id}`));
        }))
      : null);
}

export function renderChallenges(lifetimes: Lifetime[], slot: string | undefined, runs: Run[]): HTMLElement {
  const l = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot)).find((x) => x.slot === slot) ?? lifetimes[0];
  const ids = l?.challenges ? new Set(l.challenges) : undefined;
  const all = known();
  const done = ids ? all.filter((c) => ids.has(c.id)).length : 0;
  if (!ids) view.show = "all";
  const grid = h("div", { class: "chal-grid" });
  const count = h("span", { class: "muted" });

  const draw = () => {
    const q = view.query.trim().toLowerCase();
    const list = all
      .filter((c) => view.show === "all" || (view.show === "done") === !!ids?.has(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (CHALLENGES[c.id] ?? "").toLowerCase().includes(q)
        || (CHARACTERS[c.player] ?? "").toLowerCase().includes(q) || String(c.id) === q);
    count.textContent = `${list.length} shown`;
    grid.replaceChildren(...(list.length ? list.map((c) => card(c, ids ? ids.has(c.id) : undefined, runs))
      : [emptyNote(view.show === "todo" ? "All finished." : "Nothing matches.")]));
  };

  const controls = h("div", { class: "toolbar" },
    ids ? h("label", null, "Show ", h("select", { onChange: (e: Event) => { view.show = (e.target as HTMLSelectElement).value as Show; draw(); } },
      SHOWS.map(([v, text]) => h("option", { value: v, selected: v === view.show }, text)))) : null,
    h("input", {
      type: "search", placeholder: "Find…", value: view.query, class: "input-search", "aria-label": "Find a challenge",
      onInput: (e: Event) => { view.query = (e.target as HTMLInputElement).value; draw(); },
    }),
    count);

  draw();
  return h("div", { class: "page" },
    h("p", null, h("a", { href: "#/lifetime", class: "back" }, "← Lifetime")),
    h("div", { class: "page-head" }, h("h1", null, "Challenges"),
      ids ? h("span", { class: "muted" }, `${done} of ${all.length} finished`) : null),
    h("p", { class: "page-note" }, ids
      ? "Finished comes from your save, attempts from recorded runs. Rules and unlocks are from the game files."
      : "Which ones you finished needs Isaac Run History 1.3 or newer: update the mod, play or open a run, and import the new export."),
    controls,
    h("section", { class: "card card-wide" }, grid));
}
