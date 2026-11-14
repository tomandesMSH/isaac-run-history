// One run: summary, final stats and a floor-by-floor timeline of what was picked up.

import { ROOM_TYPES, curseNames, endingName, floorName } from "../data/game";
import { itemInfo, trinketInfo } from "../data/items";
import { copyButton, emptyNote, h, itemChip, resultBadge, wikiLink } from "../dom";
import {
  bossName, challengeName, characterName, dateTime, difficultyName, duration, isGreed, killerName, resultText,
} from "../format";
import type { Run } from "../model/schema";
import { runsLink } from "../router";
import { shareRun } from "../share";
import { statsByFloor } from "./charts";

function meta(label: string, value: Node | string): HTMLElement {
  return h("div", { class: "meta" }, h("dt", null, label), h("dd", null, value));
}

function statsGrid(run: Run): HTMLElement {
  const s = run.stats;
  if (!s) return emptyNote("No stats recorded.");
  const fmt = (v?: number) => (v === undefined ? "?" : String(Math.round(v * 100) / 100));
  const rows: [string, number | undefined][] = [
    ["Damage", s.damage], ["Tears", s.tears], ["Speed", s.speed], ["Range", s.range], ["Shot speed", s.shotSpeed], ["Luck", s.luck],
  ];
  return h("dl", { class: "stat-grid" }, rows.map(([l, v]) => h("div", { class: "stat" }, h("dt", null, l), h("dd", null, fmt(v)))));
}

function timeline(run: Run): HTMLElement {
  const greed = isGreed(run);
  const last = run.floors.length - 1;
  return h("ol", { class: "timeline" }, run.floors.map((f, i) => {
    const items = run.items.filter((it) => it.floor === i);
    const trinkets = run.trinkets.filter((t) => t.floor === i);
    const curses = curseNames(f.curses);
    const isEnd = i === last;
    const result = run.result;
    return h("li", { class: `floor${isEnd ? ` floor-end floor-end-${result.type}` : ""}` },
      h("div", { class: "floor-head" },
        h("h3", null, floorName(f.stage, f.stageType, greed, f.curses ?? 0)),
        f.enteredAtFrame !== undefined && i > 0 ? h("span", { class: "muted small" }, duration(f.enteredAtFrame)) : null,
        curses.map((c) => h("span", { class: "chip chip-curse" }, c))),
      f.bosses.length ? h("p", { class: "floor-bosses" }, "Beat ", f.bosses.map((b, j) => [j ? " & " : "", h("a", { href: "#/bosses", title: "All bosses" }, h("strong", null, bossName(b.bossId))),
        " ", wikiLink(bossName(b.bossId)),
        b.frame !== undefined && f.enteredAtFrame !== undefined ? h("span", { class: "muted" }, ` at ${duration(b.frame)}`) : null])) : null,
      items.length || trinkets.length
        ? h("div", { class: "item-list" },
          items.map((it) => {
            const badges: string[] = [];
            if (it.starting) badges.push("start");
            if (it.removed) badges.push("lost");
            const room = it.roomType !== undefined ? ROOM_TYPES[it.roomType] : undefined;
            return itemChip(itemInfo(it.id, it.name), {
              badges, muted: it.removed, href: runsLink({ item: it.name ?? "" }),
              title: [room, it.frame !== undefined && !it.starting ? `at ${duration(it.frame)}` : null].filter(Boolean).join(", ") || undefined,
            });
          }),
          trinkets.map((t) => {
            const badges = ["trinket"];
            if (t.golden) badges.push("golden");
            if (t.smelted) badges.push("smelted");
            if (t.starting) badges.push("start");
            return itemChip(trinketInfo(t.id, t.name), { badges });
          }))
        : h("p", { class: "muted small" }, "Nothing picked up."),
      isEnd && result.type !== "quit" && result.type !== "unknown"
        ? h("p", { class: `floor-result result-text-${result.type}` },
          result.type === "win" ? `Won: ${endingName(result.ending)}` : `Died to ${killerName(result.killedBy)}`)
        : null);
  }));
}

export function renderRun(run: Run | undefined, onDelete: (run: Run) => void): HTMLElement {
  if (!run) {
    return h("div", { class: "page" }, h("h1", null, "Run not found"), h("p", null, h("a", { href: "#/runs" }, "Back to all runs")));
  }
  const challenge = challengeName(run);
  const floorStats = statsByFloor(run);
  const k = run.result.killedBy;
  const deleteBtn = h("button", {
    class: "btn btn-small btn-danger", type: "button",
    onClick: () => { if (confirm("Remove this run from the page? (The file in the game isn't touched.)")) onDelete(run); },
  }, "Remove run");
  const shareBtn: HTMLButtonElement = h("button", {
    class: "btn btn-small", type: "button", title: "A PNG picture of this run, to post or send",
    onClick: async () => {
      shareBtn.disabled = true;
      try {
        shareBtn.textContent = `${await shareRun(run)} ✓`;
      } catch (e) {
        shareBtn.textContent = (e as Error).message;
      }
      setTimeout(() => { shareBtn.textContent = "Share image"; shareBtn.disabled = false; }, 2500);
    },
  }, "Share image");

  return h("div", { class: "page" },
    h("p", null, h("a", { href: "#/runs", class: "back" }, "← All runs")),
    h("section", { class: "card card-wide run-sheet" },
    h("div", { class: "run-head" },
      h("div", null,
        h("h1", null, characterName(run), h("span", { class: "muted" }, ` · ${difficultyName(run.difficulty)}`)),
        h("p", { class: "run-result" }, resultBadge(run), " ", resultText(run))),
      h("div", { class: "run-actions" }, shareBtn, deleteBtn)),
    h("dl", { class: "meta-grid" },
      meta("Started", dateTime(run.startedAt)),
      meta("Run time", duration(run.durationFrames)),
      meta("Seed", h("span", null, h("code", null, run.seed), " ", copyButton(run.seed))),
      challenge ? meta("Challenge", challenge) : null,
      run.completions.length ? meta("Completed", run.completions.map(endingName).join(", ")) : null,
      k?.via ? meta("Killing blow", `${k.via.name ?? `entity ${k.via.type}.${k.via.variant ?? 0}`} from ${killerName(k)}`) : null,
      run.shareSeedCode ? meta("ShareSeed", h("span", null, h("code", { class: "wrap" }, run.shareSeedCode), " ", copyButton(run.shareSeedCode))) : null,
      run.shareSeedRun ? meta("Played from", "someone else's ShareSeed code") : null,
      run.customSeed ? meta("Seed type", "custom seed (no achievements)") : null,
      run.partial ? meta("Note", "recording started mid-run; earlier items are under the first floor") : null,
      run.saveSlot ? meta("Save slot", String(run.saveSlot)) : null)),
    h("section", { class: "card card-wide" }, h("header", { class: "card-head" }, h("h2", null, "Final stats")), statsGrid(run)),
    floorStats ? h("section", { class: "card card-wide" }, h("header", { class: "card-head" }, h("h2", null, "Stats by floor"),
      h("p", { class: "card-note" }, "On entering each floor, then at the end of the run. Hover a point for the floor.")), floorStats) : null,
    h("section", { class: "card card-wide" }, h("header", { class: "card-head" }, h("h2", null, "Floor by floor")), timeline(run)));
}
