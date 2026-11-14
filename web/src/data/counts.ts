// Counts the always-loaded pages (Lifetime, Compare) need, from data/meta.json, so the big lists
// (achievements.json, challenges.json) load only with their own page.

import meta from "./meta.json";
import type { Lifetime } from "../model/schema";

const ACHIEVEMENT_IDS: number[] = meta.achievements;
const CHALLENGE_IDS: number[] = meta.challenges;
const QUALITY = meta.quality as Record<string, number>;

/** How many achievements a lifetime export has unlocked, or undefined before mod 1.2. */
export function achievementCount(l: Lifetime): { unlocked: number; total: number } | undefined {
  if (!l.achievements) return undefined;
  const ids = new Set(l.achievements);
  return { unlocked: ACHIEVEMENT_IDS.filter((id) => ids.has(id)).length, total: ACHIEVEMENT_IDS.length };
}

/** How many challenges a lifetime export has finished, or undefined before mod 1.3. */
export function challengeCount(l: Lifetime): { done: number; total: number } | undefined {
  if (!l.challenges) return undefined;
  const ids = new Set(l.challenges);
  return { done: CHALLENGE_IDS.filter((id) => ids.has(id)).length, total: CHALLENGE_IDS.length };
}

/** Item quality 0-4 from items_metadata.xml, undefined for items without one. */
export function itemQuality(id: number): number | undefined {
  return QUALITY[id];
}
