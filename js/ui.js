/* ============================================================
   ui.js — tiny DOM toolkit, icons, money helpers, shared chrome.
   No framework. Just functions that return HTML strings + a few
   imperative helpers (overlay, toast).
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---- money ---- */
export function naira(n, { sign = false } = {}) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString("en-NG");
  const pre = v < 0 ? "-" : sign && v > 0 ? "+" : "";
  return `${pre}₦${s}`;
}
// compact for hero: ₦247,650 kept full; big values get k
export function nairaFull(n) {
  return "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
}
export function pct(n) { return `${Math.round(Number(n) || 0)}%`; }

/* ---- inline icon set (stroke, currentColor) ---- */
const I = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  box: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-13L3 8m9 5v8m0-8L3 8v8l9 5',
  calc: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 5h8M8 12h2m3 0h2M8 16h2m3 0h2',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  shop: 'M4 9h16l-1 11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 9Zm4 0V6a4 4 0 0 1 8 0v3',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 6 6 6-6 6',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  trend: 'm3 17 6-6 4 4 8-8m0 0h-5m5 0v5',
  copy: 'M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm-2 0V5a2 2 0 0 1 2-2h9',
  share: 'M12 3v12m0-12 4 4m-4-4-4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  check: 'm5 12 5 5L20 7',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7',
  x: 'M6 6l12 12M18 6 6 18',
  spark: 'M12 3v4m0 10v4M5 12H1m22 0h-4M6.3 6.3 3.5 3.5m17 17-2.8-2.8m0-11.4 2.8-2.8M6.3 17.7l-2.8 2.8',
  tag: 'M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2m0 0h-3a2 2 0 0 0 0 4h3m0-4v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7m16 0h1',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  invoice: 'M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h4',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M6 14h12v7H6v-7Z',
  cal: 'M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 2h-4l-.4 2.4a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
  arrowRight: 'M5 12h14m0 0-6-6m6 6-6 6',
};
export function icon(name, size = 22, sw = 2) {
  const d = I[name] || "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><path d="${d}"/></svg>`;
}

/* ---- page header (web layout) ----
   actions: [{ id, label, icon, kind }]  wired by the screen's mount() */
export function pageHead({ title, intro = "", actions = [] } = {}) {
  const acts = actions.map((a) =>
    `<button class="btn ${a.kind || "ghost"}" data-act="${a.id}">${a.icon ? icon(a.icon, 18) : ""}${a.label}</button>`
  ).join("");
  return `<div class="page-head">
    <div>
      <h1>${title}</h1>
      ${intro ? `<p class="intro">${intro}</p>` : ""}
    </div>
    ${acts ? `<div class="page-actions">${acts}</div>` : ""}
  </div>`;
}

/* ---- donut chart (SVG) ---- segments: [{value,color,label}] */
export function donut(segments, centerBig, centerSub) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 78, C = 2 * Math.PI * R, gap = 3;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = seg.value / total;
    const len = Math.max(0, frac * C - gap);
    const el = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${seg.color}"
      stroke-width="20" stroke-linecap="round"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"/>`;
    offset += frac * C;
    return el;
  }).join("");
  return `<div class="donut">
    <svg viewBox="0 0 200 200" width="200" height="200">
      <circle cx="100" cy="100" r="${R}" fill="none" stroke="#eef0f7" stroke-width="20"/>
      ${arcs}
    </svg>
    <div class="center"><div class="big">${centerBig}</div><div class="sub">${centerSub}</div></div>
  </div>`;
}

/* palette for segments / legend */
export const SEG_COLORS = ["#253c96", "#f36b2e", "#12a06a", "#f59a1e", "#7c5cff", "#c4e7e5"];

/* ---- overlay / centered dialog ---- */
const overlay = () => document.getElementById("overlay");

export function openDialog(innerHTML, { title = "", wide = false } = {}) {
  const o = overlay();
  o.innerHTML = `<div class="scrim" data-close></div>
    <section class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      ${title ? `<div class="dh"><h2>${title}</h2><button class="x" data-close aria-label="Close">${icon("x", 18)}</button></div>` : ""}
      ${innerHTML}
    </section>`;
  o.hidden = false;
  document.body.style.overflow = "hidden";
  o.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeDialog));
  const esc2 = (e) => { if (e.key === "Escape") { closeDialog(); document.removeEventListener("keydown", esc2); } };
  document.addEventListener("keydown", esc2);
  return o.querySelector(".dialog");
}

export function closeDialog() {
  const o = overlay();
  o.hidden = true;
  o.innerHTML = "";
  document.body.style.overflow = "";
}

/* back-compat aliases (screens may still call these names) */
export const openSheet = (html) => openDialog(html);
export const closeSheet = closeDialog;

/* ---- toast ---- */
export function toast(msg, kind = "") {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 2200);
  setTimeout(() => el.remove(), 2600);
}

/* ---- relative time ---- */
export function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/* ---- escape for user text in templates ---- */
export function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
