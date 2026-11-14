// Hash routes: #/stats, #/runs?char=..&result=..&difficulty=..&item=.., #/run/<id>

export interface RunFilters {
  char?: string;
  result?: string;
  difficulty?: string;
  item?: string;
}

export type Route =
  | { name: "stats" }
  | { name: "lifetime" }
  | { name: "bestiary" }
  | { name: "items" }
  | { name: "character"; key: string }
  | { name: "runs"; filters: RunFilters }
  | { name: "run"; id: string };

const FILTER_KEYS: (keyof RunFilters)[] = ["char", "result", "difficulty", "item"];

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/");
  if (parts[0] === "run" && parts[1]) return { name: "run", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "lifetime") return { name: "lifetime" };
  if (parts[0] === "bestiary") return { name: "bestiary" };
  if (parts[0] === "items") return { name: "items" };
  if (parts[0] === "character" && parts[1]) return { name: "character", key: decodeURIComponent(parts[1]) };
  if (parts[0] === "runs") {
    const q = new URLSearchParams(query);
    const filters: RunFilters = {};
    for (const k of FILTER_KEYS) {
      const v = q.get(k);
      if (v) filters[k] = v;
    }
    return { name: "runs", filters };
  }
  return { name: "stats" };
}

export function runsLink(filters: RunFilters = {}): string {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k]!);
  const s = q.toString();
  return `#/runs${s ? `?${s}` : ""}`;
}

export function runLink(id: string): string {
  return `#/run/${encodeURIComponent(id)}`;
}
