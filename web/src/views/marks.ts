// Completion marks: the table (no game graphics) and the game's own completion note, the pinned
// paper the pause screen shows, drawn from gfx/ui/completion.png (ui/completion_widget.png):
// papers are 96x96, mark icons 16x16 (row y=112 normal, y=96 hard).

import { CHARACTERS } from "../data/game";
import { emptyNote, h } from "../dom";
import type { Lifetime } from "../model/schema";

type MarkEntry = Lifetime["marks"][number];

export const MARK_COLUMNS: { key: string; label: string; short: string }[] = [
  { key: "MomsHeart", label: "Mom's Heart", short: "Heart" },
  { key: "Isaac", label: "Isaac", short: "Isaac" },
  { key: "Satan", label: "Satan", short: "Satan" },
  { key: "BossRush", label: "Boss Rush", short: "Rush" },
  { key: "BlueBaby", label: "???", short: "???" },
  { key: "Lamb", label: "The Lamb", short: "Lamb" },
  { key: "MegaSatan", label: "Mega Satan", short: "Mega" },
  { key: "UltraGreed", label: "Greed / Greedier", short: "Greed" },
  { key: "Hush", label: "Hush", short: "Hush" },
  { key: "Delirium", label: "Delirium", short: "Deli" },
  { key: "Mother", label: "Mother", short: "Mother" },
  { key: "Beast", label: "The Beast", short: "Beast" },
];

// where each mark sits on the note (completion_widget.anm2) and its icon's x in the sheet;
// the widget has no Delirium layer, so it gets the free bottom-right spot
const NOTE_MARKS: Record<string, { x: number; y: number; icon: number }> = {
  MomsHeart: { x: 22, y: 7, icon: 64 },
  Isaac: { x: 34, y: 17, icon: 32 },
  Satan: { x: 25, y: 23, icon: 48 },
  BossRush: { x: 14, y: 36, icon: 80 },
  BlueBaby: { x: 49, y: 20, icon: 0 },
  Lamb: { x: 37, y: 32, icon: 16 },
  MegaSatan: { x: 54, y: 37, icon: 112 },
  UltraGreed: { x: 64, y: 16, icon: 144 },
  Hush: { x: 11, y: 51, icon: 128 },
  Mother: { x: 27, y: 49, icon: 160 },
  Beast: { x: 41, y: 54, icon: 176 },
  Delirium: { x: 57, y: 54, icon: 192 },
};

/** 0 = not yet, 1 = normal, 2 = hard. The save stores bits (1 normal, 2 hard), so a hard win reads 3. */
export function markValues(m: MarkEntry): number[] {
  const marks = m.marks;
  return MARK_COLUMNS.map((c) => {
    const v = c.key === "UltraGreed"
      ? Math.max(marks.UltraGreed ?? 0, (marks.UltraGreedier ?? 0) > 0 ? 2 : 0)
      : marks[c.key] ?? 0;
    return Math.min(2, v);
  });
}

export function characterLabel(m: MarkEntry): string {
  return CHARACTERS[m.id] ?? m.name ?? `#${m.id}`;
}

function summaryText(values: number[]): string {
  const done = values.filter((v) => v > 0).length;
  const hard = values.filter((v) => v >= 2).length;
  return hard === values.length ? "all hard" : `${done}/${values.length}${hard ? `, ${hard} hard` : ""}`;
}

/** The game's completion note for one character. Tainted characters (id 21+) get the torn paper. */
export function marksNote(m: MarkEntry): HTMLElement {
  const values = markValues(m);
  const tainted = m.id >= 21;
  return h("div", {
    class: `marks-note${tainted ? " tainted" : ""}`,
    role: "img",
    "aria-label": `${characterLabel(m)}: ${MARK_COLUMNS.map((c, i) => `${c.label} ${values[i] === 0 ? "not yet" : values[i] === 1 ? "normal" : "hard"}`).join(", ")}`,
  }, MARK_COLUMNS.map((c, i) => {
    const pos = NOTE_MARKS[c.key];
    const v = values[i];
    if (!pos || v === 0) return null;
    return h("span", {
      class: "marks-note-mark",
      title: `${c.label}: ${v === 1 ? "normal" : "hard"}`,
      style: `left: calc(${pos.x}px * var(--s)); top: calc(${pos.y}px * var(--s));`
        + ` background-position: calc(-${pos.icon}px * var(--s)) calc(-${v === 2 ? 96 : 112}px * var(--s));`,
    });
  }));
}

function marksTable(l: Lifetime): HTMLElement {
  return h("div", { class: "table-scroll" }, h("table", { class: "table marks" },
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, "Character"),
      MARK_COLUMNS.map((c) => h("th", { scope: "col", class: "mark-col", title: c.label }, c.short)),
      h("th", { scope: "col", class: "num" }, "Done"))),
    h("tbody", null, l.marks.map((m) => {
      const values = markValues(m);
      return h("tr", null,
        h("th", { scope: "row" }, h("a", { href: characterLink(m.id) }, characterLabel(m))),
        values.map((v, i) => h("td", { class: "mark-cell" },
          h("span", {
            class: `mark mark-${v}`,
            title: `${MARK_COLUMNS[i].label}: ${v === 0 ? "not yet" : v === 1 ? "normal" : "hard"}`,
          }, v === 0 ? "" : v === 1 ? "N" : "H"))),
        h("td", { class: "num" }, summaryText(values)));
    }))));
}

/** Link to a character's page, by the game's player type id. */
export function characterLink(id: number): string {
  return `#/character/c:${id}`;
}

/** Every character's marks: the game's notes when its graphics are there, else a table. */
export function marksView(l: Lifetime): HTMLElement {
  if (l.marks.length === 0) return emptyNote("No completion marks in this export.");
  if (!document.body.classList.contains("has-gfx")) return marksTable(l);
  return h("div", { class: "marks-notes" }, l.marks.map((m) => {
    const values = markValues(m);
    const allHard = values.every((v) => v >= 2);
    return h("a", { class: `marks-card${allHard ? " all-hard" : ""}`, href: characterLink(m.id) },
      marksNote(m),
      h("div", { class: "marks-card-name" }, characterLabel(m)),
      h("div", { class: "marks-card-sum" }, summaryText(values)));
  }));
}
