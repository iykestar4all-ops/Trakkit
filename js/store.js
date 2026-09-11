/* ============================================================
   store.js — the spine.
   In-memory state hydrated from the backend, synced back on write.
   Reads stay synchronous so screens can render without awaiting.
   ============================================================ */

import { API } from "./api.js";

/* ---- billing constants (display copy; server is authoritative) ---- */
export const TRIAL_DAYS = 7;
export const SUB_PRICE = 5000;       // ₦ per month
export const SUB_PRICE_WEEK = 1000;  // ₦ per week

const CACHE_KEY = "trackit.cache";

let state = {
  business: { name: "", owner: "", whatsapp: "", shopSlug: "", targetMargin: 35 },
  products: [], sales: [], invoices: [], invoiceSeq: 1,
  subscription: { status: "trial", daysLeft: TRIAL_DAYS, renewsAt: null, locked: false, priceNaira: SUB_PRICE, trialDays: TRIAL_DAYS },
};

/* ---- server sync (debounced) ---- */
let syncTimer = null;
function dataBlob() {
  return { products: state.products, sales: state.sales, invoices: state.invoices, invoiceSeq: state.invoiceSeq };
}
function cache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(dataBlob())); } catch {} }
function persist() {
  cache();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { API.putState(dataBlob()).catch(() => {}); }, 500);
}

/* ---- public accessors ---- */
export const Store = {
  get: () => state,
  business: () => state.business,
  products: () => state.products,
  product: (id) => state.products.find((p) => p.id === id),
  sales: () => state.sales,

  /* hydrate from the backend (business + subscription + data). No write-back. */
  hydrate({ business, subscription, data } = {}) {
    if (business) state.business = business;
    if (subscription) state.subscription = subscription;
    if (data) {
      state.products = data.products || [];
      state.sales = data.sales || [];
      state.invoices = data.invoices || [];
      state.invoiceSeq = data.invoiceSeq || 1;
      cache();
    }
  },
  loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c) { state.products = c.products || []; state.sales = c.sales || []; state.invoices = c.invoices || []; state.invoiceSeq = c.invoiceSeq || 1; }
    } catch {}
  },
  setSubscription(sub) { if (sub) state.subscription = sub; },

  saveBusiness(patch) {
    state.business = { ...state.business, ...patch };
    API.updateBusiness(patch).catch(() => {});
  },

  upsertProduct(prod) {
    const i = state.products.findIndex((p) => p.id === prod.id);
    if (i === -1) state.products.unshift(prod);
    else state.products[i] = prod;
    persist();
    return prod;
  },

  deleteProduct(id) {
    state.products = state.products.filter((p) => p.id !== id);
    state.sales = state.sales.filter((s) => s.productId !== id);
    persist();
  },

  addSale(sale) {
    state.sales.unshift(sale);
    // decrement stock if tracked
    const p = Store.product(sale.productId);
    if (p && typeof p.stock === "number") p.stock = Math.max(0, p.stock - sale.qty);
    persist();
    return sale;
  },

  invoices: () => state.invoices || [],
  invoice: (id) => (state.invoices || []).find((i) => i.id === id),

  nextInvoiceNumber() {
    const n = state.invoiceSeq || 1;
    return "INV-" + String(n).padStart(4, "0");
  },

  upsertInvoice(inv) {
    if (!state.invoices) state.invoices = [];
    const i = state.invoices.findIndex((x) => x.id === inv.id);
    if (i === -1) {
      state.invoices.unshift(inv);
      state.invoiceSeq = (state.invoiceSeq || 1) + 1; // consume the number
    } else {
      state.invoices[i] = inv;
    }
    persist();
    return inv;
  },

  setInvoiceStatus(id, status) {
    const inv = Store.invoice(id);
    if (inv) { inv.status = status; persist(); }
    return inv;
  },

  deleteInvoice(id) {
    state.invoices = (state.invoices || []).filter((i) => i.id !== id);
    persist();
  },

  /* ---- billing (mirror of the server's view) ---- */
  subscription: () => state.subscription,
};

/* ---- invoice math ---- */
export const invSubtotal = (inv) => (inv.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
export const invTotal = (inv) => Math.max(0, invSubtotal(inv) - (Number(inv.discount) || 0));
export const invCost = (inv) => (inv.items || []).reduce((s, it) => s + (Number(it.cost) || 0) * (Number(it.qty) || 0), 0);
export const invProfit = (inv) => invTotal(inv) - invCost(inv);
export function invEffectiveStatus(inv) {
  if (inv.status === "paid") return "paid";
  if (inv.status !== "draft" && inv.dueAt && inv.dueAt < Date.now()) return "overdue";
  return inv.status;
}

/* ---- money math (the profit engine) ----
   batchYield lets a maker enter costs for a whole batch (e.g. a bag of
   sugar that makes 40 popsicles) and get an honest per-unit cost. */
export const unitCost = (p) => {
  const total = (p.costs || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const yld = Number(p.batchYield) || 1;
  return yld > 1 ? total / yld : total;
};
export const batchCost = (p) => (p.costs || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
export const unitProfit = (p) => (Number(p.price) || 0) - unitCost(p);
export const marginPct = (p) => {
  const price = Number(p.price) || 0;
  if (price <= 0) return 0;
  return (unitProfit(p) / price) * 100;
};

/* band relative to a healthy target (default 30%+) */
export function marginBand(pct) {
  if (pct < 15) return "low";
  if (pct < 30) return "mid";
  return "high";
}

export function newId(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}
