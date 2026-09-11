/* ============================================================
   store.js — the spine.
   In-memory state hydrated from the backend, synced back on write.
   Reads stay synchronous so screens can render without awaiting.
   ============================================================ */

import { API } from "./api.js";

/* ---- billing constants (display copy; server is authoritative) ---- */
export const TRIAL_DAYS = 7;
export const SUB_PRICE = 5000;       // ₦ per month

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

  ingredients: () => state.business.ingredients || [],
  /* remember ingredient names + last price so they can be reused next time */
  rememberIngredients(costs) {
    const list = (state.business.ingredients || []).slice();
    for (const c of costs || []) {
      const name = (c.name || "").trim();
      if (!name) continue;
      const entry = { name, lastAmount: Number(c.amount) || 0, lastBatches: Number(c.batches) || 1 };
      const i = list.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
      if (i === -1) list.push(entry); else list[i] = entry;
    }
    Store.saveBusiness({ ingredients: list });
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
   Batch costing:
   - each cost line has { name, amount, batches } where `amount` is what the
     purchase cost and `batches` is how many batches that purchase lasts
     (default 1). Its share of one batch = amount / batches.
   - batchYield = how many units one batch makes (default 1).
   So a ₦500 sachet of sugar that lasts 2 batches adds ₦250 to a batch, and if
   the batch makes 66 popsicles the sugar adds ₦3.79 per popsicle. */
export const lineBatchShare = (c) => (Number(c.amount) || 0) / (Number(c.batches) || 1);
export const perBatchCost = (p) => (p.costs || []).reduce((s, c) => s + lineBatchShare(c), 0);
export const unitCost = (p) => perBatchCost(p) / (Number(p.batchYield) || 1);
export const productPrice = (p) => Number(p.price) || Number(p.variants?.[0]?.price) || 0;
export const unitProfit = (p) => productPrice(p) - unitCost(p);
export const marginPct = (p) => {
  const price = productPrice(p);
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
