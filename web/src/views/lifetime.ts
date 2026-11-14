// Lifetime page: totals from the game's own save (bestiary, completion marks, item collection,
// counters). They cover the whole save file, not only the runs the mod recorded.

import { itemInfo, uiIcon } from "../data/items";
import { achievementCount } from "./achievements";
import { challengeCount } from "./challenges";
import { marksView } from "./marks";
import { bar, card, countUp, emptyNote, h, itemChip } from "../dom";
import { dateTime, percent } from "../format";
import type { Lifetime } from "../model/schema";

// Completion marks in the order the game shows them; Greed shows Greedier when that's done.
const FINAL_BOSSES: [string, string][] = [
  ["MOM_KILLS", "Mom's Heart"], ["ISAAC_KILLS", "Isaac"], ["SATAN_KILLS", "Satan"],
  ["BLUE_BABY_KILLS", "???"], ["LAMB_KILLS", "The Lamb"], ["MEGA_SATAN_KILLS", "Mega Satan"],
  ["BOSSRUSHS_CLEARED", "Boss Rush"], ["HUSH_KILLS", "Hush"], ["DELIRIUM_KILLS", "Delirium"],
  ["MOTHER_KILLS", "Mother"], ["BEAST_KILLS", "The Beast"],
];

const HEADLINE = new Set(["DEATHS", "BEST_STREAK", "STREAK_COUNTER", "NEGATIVE_STREAK_COUNTER", "EDEN_TOKENS",
  "CHARACTER_LAST_RUN_WIN", "DAILY_RUN_IS_ACTIVE", "EDENS_BLESSINGS_NEXT_RUN", ...FINAL_BOSSES.map(([k]) => k)]);

const LABELS: Record<string, string> = {
  XIII_DEATH_CARD_USED: "XIII - Death cards used",
  BLOOD_DONATION_MACHINE_USED: "Blood donations",
  DONATION_MACHINE_COUNTER: "Coins in the donation machine",
  DONATE_MACHINE_COUNTER: "Coins in the donation machine",
  GREED_DONATION_MACHINE_COUNTER: "Coins in the Greed donation machine",
  SECRET_ROOMS_WALLS_OPENED: "Secret room walls opened",
  BLOOD_CLOT_ITEM_AQUIRED: "Blood Clot picked up",
  RUBBER_CEMENT_ITEM_AQUIRED: "Rubber Cement picked up",
  DAILYS_PLAYED: "Daily runs played",
  DAILYS_WON: "Daily runs won",
  DAILYS_STREAK: "Daily run win streak",
  SHELLGAMES_PLAYED: "Shell games played",
};

// The game's other counters, grouped. A tile shows one counter, or the sum of every counter whose
// name starts with a prefix (Greed coins are counted per character). Zero tiles are left out.
interface Tile { label: string; icon?: string; item?: number; keys?: string[]; prefix?: string }

const GREED_PER_CHARACTER = "GREED_MODE_COINS_DONATED_WITH_";

const TILE_GROUPS: { title: string; tiles: Tile[] }[] = [
  {
    title: "Deals & shops",
    tiles: [
      { label: "Devil deals taken", icon: "devil", keys: ["DEVIL_DEALS_TAKEN"] },
      { label: "Angel deals taken", icon: "angel", keys: ["ANGEL_DEALS_TAKEN"] },
      { label: "Shop items bought", icon: "coin", keys: ["SHOP_ITEMS_BOUGHT"] },
      { label: "Shopkeepers killed", icon: "shopkeeper", keys: ["SHOPKEEPER_KILLED"] },
      { label: "Arcades entered", icon: "arcade", keys: ["ARCADES_ENTERED"] },
      { label: "Shell games played", icon: "shellgame", keys: ["SHELLGAMES_PLAYED"] },
      { label: "Slot machines broken", icon: "slot", keys: ["SLOT_MACHINES_BROKEN"] },
      { label: "Blood donations", icon: "heart", keys: ["BLOOD_DONATION_MACHINE_USED"] },
      { label: "Coins in the donation machine", icon: "coin", keys: ["DONATION_MACHINE_COUNTER", "DONATE_MACHINE_COUNTER"] },
      { label: "Coins in the Greed donation machine", icon: "goldcoin", keys: ["GREED_DONATION_MACHINE_COUNTER"] },
      { label: "Coins donated in Greed mode", icon: "goldcoin", prefix: GREED_PER_CHARACTER },
      { label: "Battery bums killed", icon: "batterymap", keys: ["BATTERY_BUMS_KILLED"] },
      { label: "Items from battery bums", icon: "overcharge", keys: ["BATTERY_BUM_COLLECTIBLE_PAYOUTS"] },
      { label: "Beds slept in", icon: "bed", keys: ["BEDS_USED"] },
    ],
  },
  {
    title: "Destruction",
    tiles: [
      { label: "Rocks destroyed", icon: "rock", keys: ["ROCKS_DESTROYED"] },
      { label: "Tinted rocks", icon: "rock", keys: ["TINTED_ROCKS_DESTROYED"] },
      { label: "Super special rocks", icon: "rock", keys: ["SUPER_SPECIAL_ROCKS_DESTROYED"] },
      { label: "Poop destroyed", icon: "poop", keys: ["POOP_DESTROYED"] },
      { label: "Rainbow poop", icon: "rainbowpoop", keys: ["RAINBOW_POOP_DESTROYED"] },
      { label: "Secret room walls opened", icon: "bomb", keys: ["SECRET_ROOMS_WALLS_OPENED"] },
    ],
  },
  {
    title: "Pickups & consumables",
    tiles: [
      { label: "Pills eaten", icon: "pill", keys: ["PILLS_EATEN"] },
      { label: "Cards used", icon: "card", keys: ["CARDS_USED"] },
      { label: "XIII - Death cards used", icon: "card", keys: ["XIII_DEATH_CARD_USED"] },
      { label: "Batteries collected", icon: "battery", keys: ["BATTERIES_COLLECTED"] },
      { label: "Chests opened with a key", icon: "key", keys: ["CHESTS_OPENED_WITH_KEY"] },
      { label: "Eden's Blessings for the next run", keys: ["EDENS_BLESSINGS_NEXT_RUN"] },
    ],
  },
  {
    title: "Daily runs",
    tiles: [
      { label: "Daily runs played", icon: "daily", keys: ["DAILYS_PLAYED"] },
      { label: "Daily runs won", icon: "daily", keys: ["DAILYS_WON"] },
      { label: "Daily win streak", icon: "daily", keys: ["DAILYS_STREAK"] },
    ],
  },
];

// shown last, below Other: the items the game counts pick-ups of, with the item's own sprite
const ITEM_GROUP = {
  title: "Items",
  tiles: [
    { label: "Blood Clot picked up", item: 254, keys: ["BLOOD_CLOT_ITEM_AQUIRED"] },
    { label: "Rubber Cement picked up", item: 221, keys: ["RUBBER_CEMENT_ITEM_AQUIRED"] },
  ] as Tile[],
};

function tileValue(t: Tile, c: Record<string, number>): number {
  if (t.prefix) return Object.entries(c).filter(([k]) => k.startsWith(t.prefix!)).reduce((a, [, v]) => a + v, 0);
  return (t.keys ?? []).reduce((a, k) => a + (c[k] ?? 0), 0);
}

function tileGroups(c: Record<string, number>): HTMLElement[] {
  const used = new Set<string>(HEADLINE);
  for (const g of [...TILE_GROUPS, ITEM_GROUP]) for (const t of g.tiles) for (const k of t.keys ?? []) used.add(k);
  // whatever the game counts that isn't grouped above still shows, under Other
  const other: Tile[] = Object.keys(c)
    .filter((k) => !used.has(k) && !k.startsWith(GREED_PER_CHARACTER))
    .sort((a, b) => label(a).localeCompare(label(b)))
    .map((k) => ({ label: label(k), keys: [k] }));
  return [...TILE_GROUPS, { title: "Other", tiles: other }, ITEM_GROUP].flatMap((g) => {
    const tiles = g.tiles.map((t) => ({ t, v: tileValue(t, c) })).filter(({ v }) => v > 0);
    if (tiles.length === 0) return [];
    // Other has no icons, so its tiles drop the icon slot and pack tighter (one row on a wide screen)
    const compact = g.tiles === other;
    return [card(g.title, h("div", { class: compact ? "stat-tiles compact" : "stat-tiles" }, tiles.map(({ t, v }) => {
      const icon = t.item !== undefined ? itemInfo(t.item).icon : uiIcon(t.icon);
      return h("div", { class: "stat-tile" },
        icon ? h("img", { class: "stat-tile-icon", src: icon, alt: "" }) : compact ? null : h("span", { class: "stat-tile-icon" }),
        h("div", null, h("div", { class: "stat-tile-value" }, num(v)), h("div", { class: "stat-tile-label" }, t.label)));
    })), { wide: true })];
  });
}

function label(name: string): string {
  if (LABELS[name]) return LABELS[name];
  const s = name.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function num(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

function kpi(title: string, value: string | number, sub?: string | Node): HTMLElement {
  const text = typeof value === "number" ? num(value) : value;
  const v = h("div", { class: text.length >= 6 ? "kpi-value long" : "kpi-value" }, text);
  if (typeof value === "number") countUp(v, value, (n) => num(Math.round(n)));
  return h("div", { class: "kpi" },
    h("div", { class: "kpi-label" }, title),
    v,
    sub ? h("div", { class: "kpi-sub" }, sub) : null);
}

function countBars(rows: { label: string; value: number }[], kind: "death" | "win" | "neutral"): HTMLElement {
  if (rows.length === 0) return emptyNote("Nothing yet.");
  const max = Math.max(...rows.map((r) => r.value));
  return h("table", { class: "table" }, h("tbody", null, rows.map((r) =>
    h("tr", null,
      h("th", { scope: "row" }, r.label),
      h("td", { class: "bar-cell" }, bar(r.value / max, num(r.value), kind))))));
}

function enemyName(e: Lifetime["bestiary"][number]): string {
  return e.name && !e.name.startsWith("#") ? e.name : `Entity ${e.type}.${e.variant}`;
}

export function renderLifetime(lifetimes: Lifetime[], slot: string | undefined, onSlot: (slot: string) => void): HTMLElement {
  if (lifetimes.length === 0) {
    return h("div", { class: "page" },
      h("div", { class: "page-head" }, h("h1", null, "Lifetime")),
      card("No lifetime stats yet", h("p", null,
        "Import an export from mod version 1.1 or newer. It reads your game's own save: completion marks, ",
        "the bestiary, your item collection and the game's counters, for every run you ever played.")));
  }
  const sorted = [...lifetimes].sort((a, b) => a.slot.localeCompare(b.slot));
  const l = sorted.find((x) => x.slot === slot) ?? sorted[0];
  const c = l.counters;

  const slotPicker = sorted.length > 1
    ? h("label", null, "Save slot ",
      h("select", { onChange: (e: Event) => onSlot((e.target as HTMLSelectElement).value) },
        sorted.map((x) => h("option", { value: x.slot, selected: x.slot === l.slot }, x.slot))))
    : null;

  const totalKills = l.bestiary.reduce((a, e) => a + e.kills, 0);
  const totalBestiaryDeaths = l.bestiary.reduce((a, e) => a + e.deaths, 0);
  const col = l.collection;
  const ach = achievementCount(l);
  const chal = challengeCount(l);

  const kpis = h("div", { class: "kpis kpis-many" },
    kpi("Deaths", c.DEATHS ?? 0, `${num(totalBestiaryDeaths)} of them to enemies`),
    kpi("Best streak", c.BEST_STREAK ?? 0, `current: ${num(c.STREAK_COUNTER)}${c.NEGATIVE_STREAK_COUNTER ? `, losing: ${num(c.NEGATIVE_STREAK_COUNTER)}` : ""}`),
    kpi("Enemies killed", totalKills, h("a", { href: "#/bestiary", title: "Open the bestiary" }, `${l.bestiary.length} kinds met →`)),
    kpi("Items collected", col.total ? col.have.length : "–", col.total ? h("a", { href: "#/items", title: "Open the item collection" }, `of ${num(col.total)} · ${percent(col.have.length / col.total)} →`) : undefined),
    kpi("Eden tokens", c.EDEN_TOKENS ?? 0),
    ach ? kpi("Achievements", ach.unlocked, h("a", { href: "#/achievements", title: "Open the achievements" }, `of ${num(ach.total)} →`))
      : kpi("Achievements", "?", h("a", { href: "#/achievements" }, "needs mod 1.2 →")),
    chal ? kpi("Challenges", chal.done, h("a", { href: "#/challenges", title: "Open the challenges" }, `of ${num(chal.total)} →`))
      : kpi("Challenges", "?", h("a", { href: "#/challenges" }, "needs mod 1.3 →")));

  const deadliest = [...l.bestiary].filter((e) => e.deaths > 0).sort((a, b) => b.deaths - a.deaths).slice(0, 15)
    .map((e) => ({ label: enemyName(e), value: e.deaths }));
  const mostKilled = [...l.bestiary].filter((e) => e.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 15)
    .map((e) => ({ label: enemyName(e), value: e.kills }));
  const bosses = FINAL_BOSSES.map(([k, name]) => ({ label: name, value: c[k] ?? 0 })).filter((r) => r.value > 0);

  const missing = col.missing.map((m) => itemInfo(m.id, m.name));

  return h("div", { class: "page" },
    h("div", { class: "page-head" }, h("h1", null, "Lifetime"),
      h("div", { class: "toolbar" }, slotPicker,
        h("span", { class: "muted" }, `from your save, ${dateTime(l.takenAt)}`))),
    kpis,
    card("Completion marks", marksView(l), {
      wide: true,
      note: "N = beaten on normal, H = on hard. Greed counts Greedier as hard.",
    }),
    h("div", { class: "grid grid-3" },
      card("What killed you most", countBars(deadliest, "death"), { note: "From the game's bestiary: every death, not only recorded runs." }),
      card("Final bosses beaten", countBars(bosses, "win")),
      card("Most killed enemies", countBars(mostKilled, "neutral"))),
    tileGroups(c),
    missing.length
      ? card(`Items not in your collection yet (${missing.length})`,
        h("div", { class: "item-list collection-missing" }, missing.map((i) => itemChip(i, { title: i.name }))),
        { wide: true, note: col.total ? h("span", null, bar(col.have.length / col.total, `${col.have.length} of ${col.total} collected`, "win")) : undefined })
      : col.total
        ? card("Collection complete", bar(1, `${col.have.length} of ${col.total} collected`, "win"), { wide: true })
        : null);
}
