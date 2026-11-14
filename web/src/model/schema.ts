// Types for the mod's export (schema/run-history.schema.json) and parsing of an uploaded file.

export type ResultType = "win" | "death" | "quit" | "unknown";
export type Difficulty = "normal" | "hard" | "greed" | "greedier";

export interface EntityRefInfo {
  type: number;
  variant?: number;
  subType?: number;
  name?: string;
}

export interface Killer extends EntityRefInfo {
  boss?: boolean;
  flags?: number;
  via?: EntityRefInfo;
}

export interface Floor {
  stage: number;
  stageType: number;
  curses?: number;
  enteredAtFrame?: number;
  bosses: { bossId: number }[];
}

export interface ItemPickup {
  id: number;
  name?: string;
  floor: number;
  frame?: number;
  roomType?: number;
  pool?: number;
  starting?: boolean;
  removed?: boolean;
  removedFloor?: number;
}

export interface TrinketPickup {
  id: number;
  name?: string;
  golden?: boolean;
  floor: number;
  frame?: number;
  starting?: boolean;
  smelted?: boolean;
}

export interface Run {
  id: string;
  startedAt?: string;
  endedAt?: string;
  durationFrames?: number;
  seed: string;
  seedNum: number;
  customSeed?: boolean;
  partial?: boolean;
  character: { id: number; name?: string };
  difficulty: Difficulty;
  challenge?: { id: number };
  result: { type: ResultType; ending?: string; killedBy?: Killer; stage?: number; stageType?: number };
  completions: string[];
  floors: Floor[];
  items: ItemPickup[];
  trinkets: TrinketPickup[];
  stats?: { damage?: number; tears?: number; speed?: number; range?: number; shotSpeed?: number; luck?: number };
  shareSeedCode?: string;
  shareSeedRun?: boolean;
  /** Added on import: which save slot the run came from. */
  saveSlot?: number;
}

/** Totals from the game's own save (persistentgamedata), read by the mod. One per save slot. */
export interface Lifetime {
  /** Which save slot it belongs to; also the key it's stored under. */
  slot: string;
  takenAt?: string;
  counters: Record<string, number>;
  marks: { id: number; name?: string; marks: Record<string, number> }[];
  bestiary: { type: number; variant: number; name?: string; kills: number; deaths: number; encounters: number }[];
  collection: { total: number; have: number[]; missing: { id: number; name?: string }[] };
  /** Unlocked achievement ids; missing in exports from mod versions before 1.2. */
  achievements?: number[];
  /** ids of the finished challenges (mod 1.3+) */
  challenges?: number[];
}

export interface ParsedExport {
  runs: Run[];
  lifetime?: Lifetime;
  saveSlot?: number;
  modVersion?: string;
  skipped: number;
}

function normalizeLifetime(raw: unknown, saveSlot?: number): Lifetime | undefined {
  const l = obj<Record<string, unknown>>(raw);
  if (!l) return undefined;
  const col = obj<Record<string, unknown>>(l.collection) ?? {};
  return {
    slot: saveSlot !== undefined ? String(saveSlot) : "?",
    takenAt: typeof l.takenAt === "string" ? l.takenAt : undefined,
    counters: obj<Record<string, number>>(l.counters) ?? {},
    marks: arr<Lifetime["marks"][number]>(l.marks).map((m) => ({ ...m, marks: obj<Record<string, number>>(m.marks) ?? {} })),
    bestiary: arr<Lifetime["bestiary"][number]>(l.bestiary),
    collection: {
      total: typeof col.total === "number" ? col.total : 0,
      have: arr<number>(col.have),
      missing: arr<{ id: number; name?: string }>(col.missing),
    },
    achievements: l.achievements === undefined ? undefined : arr<number>(l.achievements),
    challenges: l.challenges === undefined ? undefined : arr<number>(l.challenges),
  };
}

const FORMAT = "isaac-run-history";
const SUPPORTED_VERSION = 1;

// The mod's JSON encoder writes an empty Lua table as [], so objects can come in as arrays.
function obj<T>(v: unknown): T | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : undefined;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeRun(raw: unknown, saveSlot?: number): Run | null {
  const r = obj<Record<string, unknown>>(raw);
  if (!r || typeof r.id !== "string" || !obj(r.character)) return null;
  const result = obj<Run["result"]>(r.result);
  if (!result || !result.type) return null; // the run in progress has no result
  const floors = arr<Floor>(r.floors).map((f) => ({ ...f, bosses: arr<{ bossId: number }>(f.bosses) }));
  return {
    ...(r as unknown as Run),
    challenge: obj<{ id: number }>(r.challenge),
    stats: obj<Run["stats"]>(r.stats),
    result: { ...result, killedBy: obj<Killer>(result.killedBy) },
    completions: arr<string>(r.completions),
    floors,
    items: arr<ItemPickup>(r.items),
    trinkets: arr<TrinketPickup>(r.trinkets),
    saveSlot: (r.saveSlot as number | undefined) ?? saveSlot,
  };
}

/** Parse the text of a save<N>.dat / `rh export`. Throws an Error with a readable message. */
export function parseExport(text: string): ParsedExport {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error("This isn't JSON. Upload save1.dat (or save2/3) from the game's data\\isaac-run-history folder, or paste the result of `rh export`.");
  }
  const d = obj<Record<string, unknown>>(data);
  if (!d || d.format !== FORMAT) {
    throw new Error("This isn't an Isaac Run History export (wrong format).");
  }
  if (typeof d.version !== "number" || d.version > SUPPORTED_VERSION) {
    throw new Error(`Export version ${String(d.version)} is newer than this page supports (${SUPPORTED_VERSION}). Reload the page to get the latest version.`);
  }
  const saveSlot = typeof d.saveSlot === "number" ? d.saveSlot : undefined;
  const runs: Run[] = [];
  let skipped = 0;
  for (const raw of arr<unknown>(d.runs)) {
    const run = normalizeRun(raw, saveSlot);
    if (run) runs.push(run);
    else skipped++;
  }
  return {
    runs,
    lifetime: normalizeLifetime(d.lifetime, saveSlot),
    saveSlot,
    modVersion: typeof d.modVersion === "string" ? d.modVersion : undefined,
    skipped,
  };
}
