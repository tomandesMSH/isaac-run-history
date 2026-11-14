// Tiny DOM helpers and the small components shared by the views.

import type { ItemInfo } from "./data/items";
import type { Run } from "./model/schema";
import { RESULT_LABELS } from "./format";

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

/** h("a", { href: "#", onClick: fn, class: "x" }, "text", child, [more]) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "class") el.className = String(v);
      else if (k === "value" || k === "checked") (el as unknown as Record<string, unknown>)[k] = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function clear(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** An item (or trinket) name, with its icon once icons exist. */
export function itemChip(item: ItemInfo, opts: { href?: string; badges?: string[]; title?: string; muted?: boolean } = {}): HTMLElement {
  const content: Child[] = [
    item.icon ? h("img", { class: "item-icon", src: item.icon, alt: "", width: 32, height: 32, loading: "lazy" }) : null,
    h("span", { class: "item-name" }, item.name),
    ...(opts.badges ?? []).map((b) => h("span", { class: "badge" }, b)),
  ];
  const cls = `item${item.modded ? " item-modded" : ""}${opts.muted ? " item-muted" : ""}`;
  return opts.href ? h("a", { class: cls, href: opts.href, title: opts.title }, content) : h("span", { class: cls, title: opts.title }, content);
}

export function resultBadge(run: Run): HTMLElement {
  return h("span", { class: `result result-${run.result.type}` }, RESULT_LABELS[run.result.type] ?? run.result.type);
}

/** Horizontal bar for tables; value between 0 and 1. */
export function bar(value: number, label: string, kind: "win" | "neutral" | "death" = "neutral"): HTMLElement {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return h("div", { class: `bar bar-${kind}`, role: "img", "aria-label": label },
    h("span", { class: "bar-fill", style: { width: `${pct}%` } }),
    h("span", { class: "bar-label" }, label));
}

export function card(title: string, body: Child, opts: { note?: Child; wide?: boolean } = {}): HTMLElement {
  return h("section", { class: `card${opts.wide ? " card-wide" : ""}` },
    h("header", { class: "card-head" }, h("h2", null, title), opts.note ? h("p", { class: "card-note" }, opts.note) : null),
    body);
}

export function emptyNote(text: string): HTMLElement {
  return h("p", { class: "muted" }, text);
}

export function copyButton(text: string, label = "Copy"): HTMLButtonElement {
  const btn = h("button", { class: "btn btn-small", type: "button" }, label);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = label), 1500);
  });
  return btn;
}

/** Counts a number up from 0 in `el` (ease-out, ~1.2 s), shown through `fmt`; skipped when the
 *  viewer prefers reduced motion. */
export function countUp(el: HTMLElement, to: number, fmt: (n: number) => string = (n) => Math.round(n).toLocaleString()): void {
  el.textContent = fmt(to);
  if (to <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ms = 1200;
  let start: number | undefined;
  const step = (t: number) => {
    start ??= t;
    const p = Math.min(1, (t - start) / ms);
    el.textContent = fmt(p < 1 ? to * (1 - (1 - p) ** 3) : to);
    if (p < 1 && (el.isConnected || t - start < 100)) requestAnimationFrame(step);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(step);
}

/** Link to a thing's page on the Isaac wiki (bindingofisaacrebirth.wiki.gg), opens in a new tab. */
export function wikiLink(name: string): HTMLElement {
  const page = name.trim().replace(/ /g, "_");
  return h("a", {
    class: "wiki-link", href: `https://bindingofisaacrebirth.wiki.gg/wiki/${encodeURIComponent(page)}`,
    target: "_blank", rel: "noopener", title: `${name} on the Isaac wiki`,
  }, "wiki ↗");
}
