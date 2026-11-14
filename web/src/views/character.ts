// One character: their recorded runs (win rate, records, items, deaths) and, from the lifetime
// export, their completion note.

import { CHARACTERS } from "../data/game";
import { card, emptyNote, h } from "../dom";
import { characterKey, characterName, duration, percent } from "../format";
import type { Lifetime, Run } from "../model/schema";
import { runsLink } from "../router";
import { deathCauses, endings, itemGroups, mostPickedItems, records, summary, trinketGroups } from "../stats/stats";
import { characterLabel, marksNote, markValues, MARK_COLUMNS } from "./marks";
import { countList, itemTable, kpi, recordTiles } from "./stats";

function lifetimeFor(lifetimes: Lifetime[], slot: string | undefined): Lifetime | undefined {
  const sorted = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot));
  return sorted.find((x) => x.slot === slot) ?? sorted[0];
}

function marksCard(m: Lifetime["marks"][number] | undefined): HTMLElement | null {
  if (!m) return null;
  const values = markValues(m);
  const list = h("ul", { class: "marks-list" }, MARK_COLUMNS.map((c, i) => h("li", { class: `mark-line mark-line-${values[i]}` },
    h("span", { class: `mark mark-${values[i]}` }, values[i] === 0 ? "" : values[i] === 1 ? "N" : "H"),
    ` ${c.label}`)));
  const gfx = document.body.classList.contains("has-gfx");
  return card("Completion marks", h("div", { class: "character-marks" }, gfx ? marksNote(m) : null, list));
}

export function renderCharacter(key: string, allRuns: Run[], lifetimes: Lifetime[], slot: string | undefined, countQuits: boolean): HTMLElement {
  const runs = allRuns.filter((r) => characterKey(r) === key);
  const id = key.startsWith("c:") ? Number(key.slice(2)) : undefined;
  const l = lifetimeFor(lifetimes, slot);
  const marks = id !== undefined ? l?.marks.find((m) => m.id === id) : undefined;
  const name = runs[0] ? characterName(runs[0]) : marks ? characterLabel(marks) : id !== undefined ? CHARACTERS[id] ?? `#${id}` : key.slice(2);

  const back = h("p", null, h("a", { href: "#/stats", class: "back" }, "← Statistics"));
  const head = h("div", { class: "page-head" }, h("h1", null, name),
    runs.length ? h("a", { href: runsLink({ char: key }), class: "page-head-link" }, `All ${runs.length} run${runs.length === 1 ? "" : "s"} →`) : null);

  if (runs.length === 0) {
    return h("div", { class: "page" }, back, head,
      h("p", { class: "page-note" }, `No recorded runs as ${name} yet.`),
      marksCard(marks));
  }

  const s = summary(runs, countQuits);
  const items = mostPickedItems(itemGroups(runs, countQuits), 10);
  const trinkets = mostPickedItems(trinketGroups(runs, countQuits), 10);
  const kpis = h("div", { class: "kpis" },
    kpi("Runs", [s.total, (n) => String(Math.round(n))], `${s.wins} won · ${s.deaths} died · ${s.quits} quit`),
    kpi("Win rate", s.wins + s.deaths > 0 || countQuits ? [s.winRate, percent] : "–", countQuits ? "quits count as losses" : "wins / (wins + deaths)"),
    kpi("Average run", s.avgDuration !== undefined ? [s.avgDuration, duration] : "–", "wins and deaths"),
    kpi("Items per run", s.avgItems !== undefined ? [s.avgItems, (n) => n.toFixed(1)] : "–", "starting items not counted"));

  return h("div", { class: "page" }, back, head,
    h("p", { class: "page-note" }, "Recorded runs only. The completion marks come from your save."),
    kpis,
    card("Personal records", recordTiles(records(runs, countQuits)), { wide: true }),
    h("div", { class: "grid" },
      marksCard(marks),
      card("Most picked items", items.length ? itemTable(items, "count", s.winRate) : emptyNote("No items picked up yet.")),
      card("Most held trinkets", trinkets.length ? itemTable(trinkets, "count", s.winRate, "Trinket") : emptyNote("No trinkets picked up yet.")),
      card("Endings", countList(endings(runs), "win", "No wins yet.")),
      card("Causes of death", countList(deathCauses(runs).slice(0, 10), "death", "No deaths. Nice."))));
}
