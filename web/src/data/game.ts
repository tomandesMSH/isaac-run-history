// Display names for floors, endings, curses, damage sources and rooms.

import { BOSSES, CHALLENGES, CHARACTERS } from "./enums";

export { BOSSES, CHALLENGES, CHARACTERS };

/** Highest vanilla PlayerType; above it the name recorded by the mod is used (modded characters). */
export const VANILLA_MAX_CHARACTER = 40;

// Floor names by chapter, indexed by StageType (0 original, 1 WotL, 2 Afterbirth, 4/5 Repentance alt).
const CHAPTERS: Record<number, (string | undefined)[]> = {
  1: ["Basement", "Cellar", "Burning Basement", undefined, "Downpour", "Dross"],
  2: ["Caves", "Catacombs", "Flooded Caves", undefined, "Mines", "Ashpit"],
  3: ["Depths", "Necropolis", "Dank Depths", undefined, "Mausoleum", "Gehenna"],
  4: ["Womb", "Utero", "Scarred Womb", undefined, "Corpse", "Corpse"],
};

const CURSE_LABYRINTH = 1 << 1;

export function floorName(stage: number | undefined, stageType = 0, greed = false, curses = 0): string {
  if (stage === undefined) return "?";
  if (greed) {
    if (stage >= 1 && stage <= 4) return CHAPTERS[stage][stageType] ?? CHAPTERS[stage][0]!;
    return ({ 5: "Sheol", 6: "The Shop", 7: "Ultra Greed" } as Record<number, string>)[stage] ?? `Floor ${stage}`;
  }
  if (stage >= 1 && stage <= 8) {
    const chapter = Math.ceil(stage / 2);
    const name = CHAPTERS[chapter][stageType] ?? CHAPTERS[chapter][0]!;
    if (curses & CURSE_LABYRINTH) return `${name} XL`;
    return `${name} ${stage % 2 === 1 ? "I" : "II"}`;
  }
  switch (stage) {
    case 9: return "Blue Womb";
    case 10: return stageType === 1 ? "Cathedral" : "Sheol";
    case 11: return stageType === 1 ? "The Chest" : "Dark Room";
    case 12: return "The Void";
    case 13: return "Home";
  }
  return `Floor ${stage}`;
}

/** Sort key for floors: by depth, the alt path right after the normal floor of the same depth. */
export function floorOrder(stage = 0, stageType = 0): number {
  return stage * 10 + stageType;
}

export const ENDINGS: Record<string, string> = {
  MOMS_HEART: "Mom's Heart",
  ISAAC: "Isaac",
  SATAN: "Satan",
  BOSS_RUSH: "Boss Rush",
  BLUE_BABY: "???",
  LAMB: "The Lamb",
  MEGA_SATAN: "Mega Satan",
  ULTRA_GREED: "Ultra Greed",
  HUSH: "Hush",
  ULTRA_GREEDIER: "Ultra Greedier",
  DELIRIUM: "Delirium",
  MOTHER: "Mother",
  BEAST: "The Beast",
};

export function endingName(e?: string): string {
  if (!e) return "Unknown ending";
  return ENDINGS[e] ?? e.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export const CURSES: [number, string][] = [
  [1 << 0, "Darkness"],
  [1 << 1, "Labyrinth"],
  [1 << 2, "the Lost"],
  [1 << 3, "the Unknown"],
  [1 << 4, "the Cursed"],
  [1 << 5, "the Maze"],
  [1 << 6, "the Blind"],
  [1 << 7, "the Giant"],
];

export function curseNames(bits = 0): string[] {
  return CURSES.filter(([b]) => bits & b).map(([, n]) => `Curse of ${n}`);
}

// DamageFlag bits that identify a death with no entity behind it.
const SOURCELESS: [number, string][] = [
  [1 << 16, "Curse Room door"],
  [1 << 18, "IV Bag"],
  [1 << 20, "Spiked chest"],
  [1 << 19, "Pitfall"],
  [1 << 7, "Spikes"],
  [1 << 10, "Devil deal"],
  [1 << 5, "Blood donation / self-damage"],
  [1 << 12, "TNT"],
  [1 << 2, "Explosion"],
  [1 << 15, "Poison / burn"],
  [1 << 1, "Fire"],
  [1 << 4, "Creep"],
  [1 << 24, "Crushed"],
];

export function sourcelessDamage(flags = 0): string {
  for (const [bit, name] of SOURCELESS) if (flags & bit) return name;
  return "Unknown (no source)";
}

export const ROOM_TYPES: Record<number, string> = {
  1: "Normal room", 2: "Shop", 3: "I AM ERROR", 4: "Treasure room", 5: "Boss room", 6: "Mini-boss room",
  7: "Secret room", 8: "Super secret room", 9: "Arcade", 10: "Curse room", 11: "Challenge room",
  12: "Library", 13: "Sacrifice room", 14: "Devil room", 15: "Angel room", 16: "Crawl space",
  17: "Boss Rush", 18: "Clean bedroom", 19: "Dirty bedroom", 20: "Vault", 21: "Dice room",
  22: "Black market", 23: "Greed exit", 24: "Planetarium", 25: "Teleporter", 26: "Teleporter exit",
  27: "Secret exit", 28: "Blue room", 29: "Ultra secret room",
};
