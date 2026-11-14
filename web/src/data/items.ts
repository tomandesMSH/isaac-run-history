// Item and trinket display info. Names come from the export (the mod resolves them in game);
// icons come from the game (tools/extract_assets.py -> gfx/manifest.json) and every view that
// shows an item picks them up through itemInfo() / trinketInfo().

/** Highest vanilla CollectibleType in Repentance+; higher ids belong to mods and differ between setups. */
export const VANILLA_MAX_ITEM = 732;
export const VANILLA_MAX_TRINKET = 189;

export const ITEM_ICONS: Record<number, string> = {};
export const TRINKET_ICONS: Record<number, string> = {};
const UI_ICONS = new Set<string>();

/** Icons extracted from the game by tools/extract_assets.py (gfx/manifest.json lists them). */
export function useExtractedIcons(manifest: { items?: number[]; trinkets?: number[]; icons?: string[] }): void {
  for (const id of manifest.items ?? []) ITEM_ICONS[id] = `gfx/items/${id}.png`;
  for (const id of manifest.trinkets ?? []) TRINKET_ICONS[id] = `gfx/trinkets/${id}.png`;
  for (const name of manifest.icons ?? []) UI_ICONS.add(name);
}

/** A small HUD/pickup icon from the game (coin, pill, devil...), when the graphics are there. */
export function uiIcon(name: string | undefined): string | undefined {
  return name && UI_ICONS.has(name) ? `gfx/ui/icons/${name}.png` : undefined;
}

export interface ItemInfo {
  /** Stable key for grouping across runs: the id for vanilla items, the name for modded ones. */
  key: string;
  name: string;
  icon?: string;
  modded: boolean;
}

export function itemInfo(id: number, name?: string): ItemInfo {
  const modded = id > VANILLA_MAX_ITEM;
  return {
    key: modded ? `m:${name ?? id}` : `i:${id}`,
    name: name ?? `Item #${id}`,
    icon: modded ? undefined : ITEM_ICONS[id],
    modded,
  };
}

export function trinketInfo(id: number, name?: string): ItemInfo {
  const modded = id > VANILLA_MAX_TRINKET;
  return {
    key: modded ? `mt:${name ?? id}` : `t:${id}`,
    name: name ?? `Trinket #${id}`,
    icon: modded ? undefined : TRINKET_ICONS[id],
    modded,
  };
}
