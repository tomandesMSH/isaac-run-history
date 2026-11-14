// Compare page: someone else's export (a friend's save*.dat) next to yours. Their runs are kept
// apart from yours (storage "friends") and never merged into your statistics.

import { emptyNote, h } from "../dom";
import { duration, percent } from "../format";
import { parseExport, type Lifetime, type Run } from "../model/schema";
import { deleteFriend, loadFriends, saveFriend, type Friend } from "../storage/db";
import { applyFilters, records, summary, winRateByCharacter, type RunRecord, type StatsOptions } from "../stats/stats";
import { achievementCount } from "./achievements";
import { challengeCount } from "./challenges";

let selected: string | undefined;

type Better = "high" | "low" | "none";
interface Row { label: string; you?: number; them?: number; fmt: (n: number) => string; better: Better }

function num(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function cell(v: number | undefined, other: number | undefined, row: Row): HTMLElement {
  const wins = v !== undefined && other !== undefined && v !== other && row.better !== "none"
    && (row.better === "high" ? v > other : v < other);
  return h("td", { class: `num${wins ? " cmp-better" : ""}` }, v === undefined ? "–" : row.fmt(v));
}

function table(rows: Row[], them: string): HTMLElement {
  const shown = rows.filter((r) => r.you !== undefined || r.them !== undefined);
  if (!shown.length) return emptyNote("Nothing to compare yet.");
  return h("table", { class: "table cmp-table" },
    h("thead", null, h("tr", null,
      h("th", { scope: "col" }, ""),
      h("th", { scope: "col", class: "num" }, "You"),
      h("th", { scope: "col", class: "num" }, them))),
    h("tbody", null, shown.map((r) => h("tr", null,
      h("th", { scope: "row" }, r.label),
      cell(r.you, r.them, r),
      cell(r.them, r.you, r)))));
}

function runRows(you: Run[], them: Run[], countQuits: boolean): Row[] {
  const a = summary(you, countQuits);
  const b = summary(them, countQuits);
  const decided = (s: typeof a) => (s.wins + s.deaths > 0 || countQuits ? s.winRate : undefined);
  return [
    { label: "Runs", you: a.total, them: b.total, fmt: num, better: "none" },
    { label: "Wins", you: a.wins, them: b.wins, fmt: num, better: "high" },
    { label: "Win rate", you: decided(a), them: decided(b), fmt: percent, better: "high" },
    { label: "Average run", you: a.avgDuration, them: b.avgDuration, fmt: duration, better: "none" },
    { label: "Average win", you: a.avgWinDuration, them: b.avgWinDuration, fmt: duration, better: "low" },
    { label: "Items per run", you: a.avgItems, them: b.avgItems, fmt: (n) => n.toFixed(1), better: "high" },
  ];
}

function recordRows(you: Run[], them: Run[], countQuits: boolean): Row[] {
  const a = records(you, countQuits);
  const b = records(them, countQuits);
  const labels = [...new Set([...a, ...b].map((r) => r.label))];
  const fmt = (r: RunRecord) => (n: number) =>
    r.kind === "duration" ? duration(n) : r.kind === "stat" ? String(Math.round(n * 100) / 100) : r.kind === "streak" ? `${n} wins` : num(n);
  return labels.map((label) => {
    const x = a.find((r) => r.label === label);
    const y = b.find((r) => r.label === label);
    const any = (x ?? y)!;
    // the fastest win is the one record where less is better
    return { label, you: x?.value, them: y?.value, fmt: fmt(any), better: /fastest/i.test(label) ? "low" : "high" };
  });
}

function charRows(you: Run[], them: Run[], countQuits: boolean): Row[] {
  const a = new Map(winRateByCharacter(you, countQuits).map((g) => [g.key, g]));
  const b = new Map(winRateByCharacter(them, countQuits).map((g) => [g.key, g]));
  const keys = [...new Set([...a.keys(), ...b.keys()])]
    .sort((k1, k2) => ((b.get(k2)?.runs ?? 0) + (a.get(k2)?.runs ?? 0)) - ((b.get(k1)?.runs ?? 0) + (a.get(k1)?.runs ?? 0)));
  return keys.map((k) => {
    const x = a.get(k);
    const y = b.get(k);
    return {
      label: (x ?? y)!.label,
      you: x?.decided ? x.winRate : undefined,
      them: y?.decided ? y.winRate : undefined,
      fmt: percent,
      better: "high",
    };
  });
}

function lifetimeRows(you: Lifetime | undefined, them: Lifetime | undefined): Row[] {
  const marks = (l: Lifetime | undefined, hard: boolean) =>
    l ? l.marks.reduce((n, m) => n + Object.values(m.marks).filter((v) => (hard ? v >= 2 : v > 0)).length, 0) : undefined;
  const c = (l: Lifetime | undefined, k: string) => (l ? l.counters[k] ?? 0 : undefined);
  return [
    { label: "Deaths", you: c(you, "DEATHS"), them: c(them, "DEATHS"), fmt: num, better: "none" },
    { label: "Best streak", you: c(you, "BEST_STREAK"), them: c(them, "BEST_STREAK"), fmt: num, better: "high" },
    { label: "Enemies killed", you: you && you.bestiary.reduce((n, e) => n + e.kills, 0), them: them && them.bestiary.reduce((n, e) => n + e.kills, 0), fmt: num, better: "high" },
    { label: "Items collected", you: you?.collection.have.length, them: them?.collection.have.length, fmt: num, better: "high" },
    { label: "Completion marks", you: marks(you, false), them: marks(them, false), fmt: num, better: "high" },
    { label: "Marks on hard", you: marks(you, true), them: marks(them, true), fmt: num, better: "high" },
    { label: "Achievements", you: you && achievementCount(you)?.unlocked, them: them && achievementCount(them)?.unlocked, fmt: num, better: "high" },
    { label: "Challenges", you: you && challengeCount(you)?.done, them: them && challengeCount(them)?.done, fmt: num, better: "high" },
  ];
}

function addForm(onAdded: (name: string) => void): HTMLElement {
  const name = h("input", { type: "text", placeholder: "Their name", "aria-label": "Their name", class: "input-search", maxlength: 40 }) as HTMLInputElement;
  const status = h("span", { class: "muted", "aria-live": "polite" });
  const file = h("input", {
    type: "file", accept: ".dat,.json,application/json,text/plain", hidden: true,
    onChange: async () => {
      const f = file.files?.[0];
      file.value = "";
      if (!f) return;
      try {
        const parsed = parseExport(await f.text());
        const who = name.value.trim() || f.name.replace(/\.[^.]+$/, "");
        await saveFriend({ name: who, runs: parsed.runs, lifetime: parsed.lifetime, importedAt: new Date().toISOString() });
        onAdded(who);
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    },
  }) as HTMLInputElement;
  return h("div", { class: "toolbar" },
    name,
    h("button", { class: "btn btn-primary", type: "button", onClick: () => file.click() }, "Choose their file"),
    file,
    status);
}

export function renderCompare(runs: Run[], lifetimes: Lifetime[], slot: string | undefined, countQuits: boolean, rerender: () => void): HTMLElement {
  const body = h("div", null, emptyNote("Loading…"));
  const you = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot)).find((x) => x.slot === slot) ?? lifetimes[0];
  const opts: StatsOptions = { difficulty: "all", countQuits, minRuns: 1 };
  const added = (name: string) => { selected = name; rerender(); };

  void loadFriends().then((friends: Friend[]) => {
    if (!friends.length) {
      body.replaceChildren(
        h("p", null, "Ask a friend with the mod for their ", h("code", null, "save1.dat"),
          " (in the game's data\\isaac-run-history folder) or the text from ", h("code", null, "rh export"), " saved as a file, and add it here."),
        addForm(added));
      return;
    }
    const friend = friends.find((f) => f.name === selected) ?? friends[0];
    selected = friend.name;
    const them = applyFilters(friend.runs, opts);
    const mine = applyFilters(runs, opts);
    body.replaceChildren(
      h("div", { class: "toolbar" },
        h("label", null, "Compare with ",
          h("select", { onChange: (e: Event) => { selected = (e.target as HTMLSelectElement).value; rerender(); } },
            friends.map((f) => h("option", { value: f.name, selected: f.name === friend.name }, f.name)))),
        h("span", { class: "muted" }, `${friend.runs.length} runs, added ${friend.importedAt.slice(0, 10)}`),
        h("button", {
          class: "btn", type: "button",
          onClick: async () => {
            if (!confirm(`Remove ${friend.name}'s data from this browser?`)) return;
            await deleteFriend(friend.name);
            selected = undefined;
            rerender();
          },
        }, "Remove")),
      h("div", { class: "grid" },
        h("section", { class: "card" }, h("header", { class: "card-head" }, h("h2", null, "Recorded runs")), table(runRows(mine, them, countQuits), friend.name)),
        h("section", { class: "card" }, h("header", { class: "card-head" }, h("h2", null, "Whole save")),
          you || friend.lifetime ? table(lifetimeRows(you, friend.lifetime), friend.name) : emptyNote("Neither export has lifetime stats.")),
        h("section", { class: "card" }, h("header", { class: "card-head" }, h("h2", null, "Records")), table(recordRows(mine, them, countQuits), friend.name)),
        h("section", { class: "card" }, h("header", { class: "card-head" }, h("h2", null, "Win rate by character")), table(charRows(mine, them, countQuits), friend.name))),
      h("section", { class: "card card-wide" },
        h("header", { class: "card-head" }, h("h2", null, "Add someone else")),
        addForm(added)));
  }).catch((e: Error) => body.replaceChildren(emptyNote(e.message)));

  return h("div", { class: "page" },
    h("div", { class: "page-head" }, h("h1", null, "Compare")),
    h("p", { class: "page-note" }, "Someone else's export next to yours. Their runs stay apart from yours and never count in your statistics. The better value of each pair is highlighted."),
    body);
}
