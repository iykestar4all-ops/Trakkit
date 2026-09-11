/* ============================================================
   screens.js — web app screens + dialogs.
   Each screen: { html(params), mount(root, params) }.
   The shell (sidebar/topbar) is rendered by app.js.
   ============================================================ */

import {
  Store, unitCost, unitProfit, marginPct, marginBand, newId,
  invSubtotal, invTotal, invCost, invProfit, invEffectiveStatus,
  TRIAL_DAYS, SUB_PRICE, perBatchCost, productPrice,
  monthlyOverhead, overheadPerUnit, overheadUnits, monthlyUnitsSold,
} from "./store.js";
import { API } from "./api.js";
import {
  $, $$, naira, pct, icon, pageHead, donut, SEG_COLORS,
  openDialog, closeDialog, toast, ago, esc, fileToImage,
} from "./ui.js";
import { go, logout, refreshChrome } from "./app.js";

/* ---------- shared helpers ---------- */
function currentRoute() { return location.hash.replace("#/", "").split("?")[0] || "home"; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }
function fmtDateInput(ts) { return new Date(ts).toISOString().slice(0, 10); }

function withinPeriod(ts, period) {
  const now = new Date(), d = new Date(ts);
  if (period === "today") return d.toDateString() === now.toDateString();
  if (period === "week") return (Date.now() - ts) <= 7 * 86400000;
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return true;
}
function stats(period = "month") {
  const sales = Store.sales().filter((s) => withinPeriod(s.at, period));
  let revenue = 0, cost = 0, profit = 0, owing = 0;
  const byProduct = {};
  for (const s of sales) {
    const p = Store.product(s.productId); if (!p) continue;
    const rev = (Number(p.price) || 0) * s.qty, cst = unitCost(p) * s.qty;
    revenue += rev; cost += cst; profit += rev - cst;
    if (!s.paid) owing += rev;
    byProduct[p.id] = (byProduct[p.id] || 0) + (rev - cst);
  }
  return { count: sales.length, revenue, cost, profit, owing, byProduct, sales };
}
function meter(p) {
  const m = marginPct(p), band = marginBand(m);
  return { band, w: Math.max(6, Math.min(100, (m / 40) * 100)), m };
}
function biggestOffender() {
  return Store.products().filter((p) => Number(p.price) > 0).sort((a, b) => marginPct(a) - marginPct(b))[0];
}
/* product photo (uploaded image) or emoji fallback, filling its container */
function pThumb(p) {
  return p.image ? `<img src="${p.image}" alt="" style="width:100%;height:100%;object-fit:cover"/>` : (p.emoji || "📦");
}
function priceLabel(p) {
  if (p.variants?.length) {
    const prices = p.variants.map((v) => Number(v.price) || productPrice(p)).filter((x) => x > 0);
    return "from " + naira(prices.length ? Math.min(...prices) : productPrice(p));
  }
  return naira(productPrice(p));
}
const flavorNames = (p) => (p.variants?.length ? p.variants.map((v) => esc(v.name)).join(" · ") : "");

/* ============================================================
   OVERVIEW (home)
   ============================================================ */
export const Home = {
  html() {
    const b = Store.business();
    const m = stats("month");
    const monthName = new Date().toLocaleDateString("en-NG", { month: "long" });
    const marginAll = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
    const offender = biggestOffender();
    const offenderBad = offender && marginPct(offender) < 30;

    const segs = Object.entries(m.byProduct)
      .map(([id, val], i) => ({ id, value: Math.max(0, val), color: SEG_COLORS[i % SEG_COLORS.length], label: Store.product(id)?.name || "?" }))
      .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

    return `
      ${pageHead({
        title: `Hello, ${esc(b.owner)}`,
        intro: `Here is <em>${monthName}</em> so far. This is profit per product, before running costs like rent and data.`,
        actions: [
          { id: "invoice", label: "New invoice", icon: "invoice", kind: "ghost" },
          { id: "log", label: "Log a sale", icon: "plus", kind: "accent" },
        ],
      })}

      <div class="grid cols-4">
        <div class="kpi hero">
          <div class="row"><span class="ic">${icon("trend", 18)}</span>
            ${m.count ? `<span class="chip up">${pct(marginAll)} margin</span>` : ""}</div>
          <div class="k">Profit in ${monthName}</div>
          <div class="v">${naira(m.profit)}</div>
        </div>
        <div class="kpi"><div class="row"><span class="ic rev">${icon("wallet", 18)}</span></div>
          <div class="k">Revenue</div><div class="v">${naira(m.revenue)}</div></div>
        <div class="kpi"><div class="row"><span class="ic cost">${icon("tag", 18)}</span></div>
          <div class="k">Cost of goods</div><div class="v">${naira(m.cost)}</div></div>
        <div class="kpi"><div class="row"><span class="ic owe">${icon("cal", 18)}</span></div>
          <div class="k">Owed to you</div><div class="v">${naira(m.owing)}</div></div>
      </div>

      ${offenderBad ? `
      <div class="alert" style="margin-top:16px">
        <span class="ai">${icon("spark", 20)}</span>
        <div class="at">
          <b>You are underpricing “${esc(offender.name)}”.</b>
          <p>It nets ${naira(unitProfit(offender))} a unit. That is only ${pct(marginPct(offender))} margin. See the price that gets you to ${pct(b.targetMargin)}.</p>
        </div>
        <button class="btn accent sm" data-fix="${offender.id}">Fix the price</button>
      </div>` : ""}

      <div class="split" style="margin-top:16px">
        <div class="card">
          <div class="section-title">Where profit comes from</div>
          ${segs.length ? `<div class="donut-wrap">
            ${donut(segs, naira(m.profit), "this month")}
            <div class="legend">${segs.map((x) =>
              `<div class="li"><span class="sw" style="background:${x.color}"></span>${esc(x.label)}<span class="amt">${naira(x.value)}</span></div>`).join("")}</div>
          </div>` : `<p class="help">Log a sale to see which products actually carry your profit.</p>`}
        </div>
        <div class="card">
          <div class="section-title">Recent sales</div>
          ${recentActivity(5)}
          <button class="btn ghost block" data-log style="margin-top:14px">${icon("plus", 18)} Log a sale</button>
        </div>
      </div>
    `;
  },
  mount(root) {
    $("[data-act='log']", root)?.addEventListener("click", () => openLogSale());
    $("[data-act='invoice']", root)?.addEventListener("click", () => openInvoiceEditor());
    $("[data-log]", root)?.addEventListener("click", () => openLogSale());
    $("[data-fix]", root)?.addEventListener("click", (e) => go("pricing", { id: e.currentTarget.dataset.fix }));
  },
};

function recentActivity(limit = 5) {
  const sales = Store.sales().slice(0, limit);
  if (!sales.length) return `<p class="help">No sales logged yet.</p>`;
  return sales.map((s) => {
    const p = Store.product(s.productId); if (!p) return "";
    const prof = unitProfit(p) * s.qty;
    return `<div class="act"><span class="ai">${pThumb(p)}</span>
      <span class="info"><b>${esc(p.name)}</b><span>${s.qty} × ${naira(p.price)} · ${ago(s.at)}</span></span>
      <span class="amt ${s.paid ? "pos" : "owe"}">${s.paid ? naira(prof, { sign: true }) : "owing"}</span></div>`;
  }).join("");
}

/* ============================================================
   PRODUCTS — the spine
   ============================================================ */
export const Products = {
  html() {
    const list = Store.products();
    return `
      ${pageHead({
        title: "Products",
        intro: "Set each product up once. Its cost powers your profit, your prices and your shop.",
        actions: [{ id: "add", label: "Add product", icon: "plus", kind: "accent" }],
      })}
      ${list.length ? `<div class="grid" style="gap:12px">${list.map(productRow).join("")}</div>` : emptyProducts()}
    `;
  },
  mount(root) {
    $("[data-act='add']", root)?.addEventListener("click", () => openProductEditor());
    $("[data-add-empty]", root)?.addEventListener("click", () => openProductEditor());
    $$("[data-edit]", root).forEach((el) => el.addEventListener("click", () => openProductEditor(el.dataset.edit)));
  },
};

function productRow(p) {
  const { band, w, m } = meter(p);
  const prof = unitProfit(p);
  return `<button class="prow" data-edit="${p.id}">
    <span class="thumb">${pThumb(p)}</span>
    <span class="info"><b>${esc(p.name)}${p.variants?.length ? ` <span class="help" style="font-weight:700">· ${p.variants.length} flavors</span>` : ""}</b><span class="sub">${priceLabel(p)} · cost ${naira(unitCost(p))}${typeof p.stock === "number" ? " · " + p.stock + " in stock" : ""}</span></span>
    <span class="right">
      <span class="meter-wrap"><span class="meter ${band}"><i style="width:${w}%"></i></span>
        <span class="margin-tag ${band}">${pct(m)}</span></span>
      <span class="pf ${prof < 0 ? "neg" : ""}">${naira(prof, { sign: prof > 0 })}</span>
    </span>
  </button>`;
}
function emptyProducts() {
  return `<div class="empty"><div class="ill">${icon("box", 30)}</div>
    <h3>Start with one product</h3>
    <p>Add what you sell, with what it costs to make one. Trackit does the profit maths.</p>
    <button class="btn accent" data-add-empty>Add a product</button></div>`;
}

/* ---------- product editor (dialog, two tabs) ---------- */
function openProductEditor(id) {
  const editing = id ? Store.product(id) : null;
  const p = editing ? structuredClone(editing)
    : { id: newId("p"), name: "", emoji: "📦", image: "", price: "", stock: "", batchYield: 1, costs: [{ name: "", amount: "", batches: 1 }], variants: [] };
  if (!p.batchYield) p.batchYield = 1;
  if (!Array.isArray(p.variants)) p.variants = [];
  if (!Array.isArray(p.costs) || !p.costs.length) p.costs = [{ name: "", amount: "", batches: 1 }];
  p.costs = p.costs.map((c) => ({ name: c.name || "", amount: c.amount ?? "", batches: c.batches || 1 }));
  const emojis = ["🎂","🍢","🧊","🧴","👜","🍞","🍰","🧁","👗","💄","🕯️","☕","🍫","🥤","📦"];
  const ings = Store.ingredients();

  const dlg = openDialog(`
    <div class="segment" id="pTabs" style="width:100%;margin-bottom:18px">
      <button type="button" data-tab="product" class="on" style="flex:1">Product</button>
      <button type="button" data-tab="cost" style="flex:1">Cost per unit</button>
    </div>

    <div id="tabProduct">
      <div class="field"><label>Product photo</label>
        <div class="logo-row">
          <div class="logo-preview" id="pPhoto" style="width:64px;height:64px;font-size:26px">${p.image ? `<img src="${p.image}" alt=""/>` : (p.emoji || "📦")}</div>
          <div>
            <input type="file" id="pImgFile" accept="image/png,image/jpeg,image/webp" hidden/>
            <button type="button" class="btn ghost sm" id="pImgPick">${icon("upload", 16)} Upload photo</button>
            <button type="button" class="btn ghost sm" id="pImgRemove" style="color:var(--warn)" ${p.image ? "" : "hidden"}>Remove</button>
            <button type="button" class="btn ghost sm" id="pRefine">${icon("spark", 16)} Refine with AI <span class="soon">soon</span></button>
            <p class="help">Under 1MB, or pick an emoji.</p>
          </div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px" id="emojiPick">
          ${emojis.map((e) => `<button type="button" class="thumb" data-emoji="${e}" style="width:38px;height:38px;font-size:19px;${e === p.emoji && !p.image ? "outline:2px solid var(--orange);outline-offset:2px" : ""}">${e}</button>`).join("")}
        </div></div>
      <div class="field"><label>Name</label>
        <input class="input" id="pName" placeholder="e.g. Popsicle" value="${esc(p.name)}"/></div>
      <div class="two-col">
        <div class="field"><label>Selling price</label>
          <div class="input-money"><span class="sym">₦</span><input class="input" id="pPrice" inputmode="numeric" placeholder="0" value="${p.price}"/></div></div>
        <div class="field"><label>In stock <span class="help" style="display:inline">optional</span></label>
          <input class="input" id="pStock" inputmode="numeric" placeholder="0" value="${p.stock ?? ""}"/></div>
      </div>
      <div class="field"><label>Flavors / variants <span class="help" style="display:inline">optional</span></label>
        <div id="flavorLines">${p.variants.map(flavorLineHTML).join("")}</div>
        <button type="button" class="add-cost" id="addFlavor">${icon("plus", 15)} Add a flavor</button>
        <p class="help">e.g. Mango, Coconut, Alcoholic. Each shows in your shop with its own price. Leave a price blank to use the selling price above.</p></div>
    </div>

    <div id="tabCost" hidden>
      <div class="field"><label>This batch makes</label>
        <div class="input-money"><input class="input" id="pYield" inputmode="numeric" value="${p.batchYield}" style="padding-left:13px"/><span class="sym" style="left:auto;right:13px">units</span></div>
        <p class="help">How many you get from one batch (e.g. 66 popsicles). Leave 1 if you make them one at a time.</p></div>
      <div class="field"><label>What you bought to make this batch</label>
        <div id="ingLines">${p.costs.map((c) => ingLineHTML(c)).join("")}</div>
        <datalist id="ingList">${ings.map((i) => `<option value="${esc(i.name)}"></option>`).join("")}</datalist>
        <button type="button" class="add-cost" id="addIng">${icon("plus", 15)} Add an ingredient / cost</button></div>
      <div class="card nudge" style="margin-bottom:14px">
        <b>🤨 Are you SURE that's everything?</b>
        <p>Money hides in the costs you "forget". Did you count the popsicle sticks, gas or electricity, transport to the market, packaging, and your own time?</p>
      </div>
      <div class="card" id="costReadout" style="background:var(--surface-2);border:0;padding:14px 16px"></div>
    </div>

    <div class="card" id="livePreview" style="background:var(--surface-2);border:0;padding:14px 16px;margin-top:14px"></div>
    <div class="actions">
      ${editing ? `<button class="btn ghost" id="delProduct" style="color:var(--warn);flex:none">${icon("trash",18)}</button>` : ""}
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="saveProduct">${editing ? "Save changes" : "Add product"}</button>
    </div>
  `, { title: editing ? "Edit product" : "New product", wide: true });

  // ---- tabs ----
  $$("#pTabs button", dlg).forEach((b) => b.addEventListener("click", () => {
    $$("#pTabs button", dlg).forEach((x) => x.classList.toggle("on", x === b));
    $("#tabProduct", dlg).hidden = b.dataset.tab !== "product";
    $("#tabCost", dlg).hidden = b.dataset.tab !== "cost";
  }));

  // ---- photo / emoji ----
  const photo = $("#pPhoto", dlg), imgFile = $("#pImgFile", dlg), imgRemove = $("#pImgRemove", dlg);
  $("#pImgPick", dlg).addEventListener("click", () => imgFile.click());
  imgFile.addEventListener("change", async () => {
    const f = imgFile.files?.[0]; if (!f) return;
    if (f.size > 1024 * 1024) { imgFile.value = ""; return toast("That image is over 1MB. Choose a smaller one.", "bad"); }
    const url = await fileToImage(f, { max: 400, type: "image/jpeg", quality: 0.82 });
    imgFile.value = "";
    if (!url) return toast("Could not read that image.", "bad");
    p.image = url; photo.innerHTML = `<img src="${url}" alt=""/>`; imgRemove.hidden = false;
  });
  imgRemove.addEventListener("click", () => { p.image = ""; photo.innerHTML = p.emoji || "📦"; imgRemove.hidden = true; });
  $("#pRefine", dlg).addEventListener("click", () => toast("AI photo cleanup is coming soon. Upload a clear photo for now.", "good"));
  $$("#emojiPick [data-emoji]", dlg).forEach((el) => el.addEventListener("click", () => {
    p.emoji = el.dataset.emoji;
    $$("#emojiPick [data-emoji]", dlg).forEach((x) => (x.style.outline = "none"));
    el.style.outline = "2px solid var(--orange)"; el.style.outlineOffset = "2px";
    if (!p.image) photo.innerHTML = p.emoji;
  }));

  // ---- flavors ----
  function refreshFlavors() { $("#flavorLines", dlg).innerHTML = p.variants.map(flavorLineHTML).join(""); wireFlavors(); }
  function wireFlavors() {
    $$("#flavorLines .flavor-line", dlg).forEach((row, i) => {
      row.querySelector(".fl-name").addEventListener("input", (e) => { p.variants[i].name = e.target.value; });
      row.querySelector(".fl-price input").addEventListener("input", (e) => { p.variants[i].price = e.target.value; });
      row.querySelector(".fl-del").addEventListener("click", () => { p.variants.splice(i, 1); refreshFlavors(); });
    });
  }
  $("#addFlavor", dlg).addEventListener("click", () => { p.variants.push({ name: "", price: "" }); refreshFlavors(); });
  wireFlavors();

  // ---- ingredients / costs ----
  $("#pYield", dlg).addEventListener("input", livePreview);
  function refreshIngs() { $("#ingLines", dlg).innerHTML = p.costs.map((c) => ingLineHTML(c)).join(""); wireIngs(); livePreview(); }
  function wireIngs() {
    $$("#ingLines .ing-line", dlg).forEach((row, i) => {
      const nameEl = row.querySelector(".ing-name"), costEl = row.querySelector(".ing-cost"), bEl = row.querySelector(".ing-b");
      nameEl.addEventListener("input", (e) => {
        p.costs[i].name = e.target.value;
        const match = ings.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
        if (match && !costEl.value) { costEl.value = match.lastAmount || ""; bEl.value = match.lastBatches || 1; p.costs[i].amount = costEl.value; p.costs[i].batches = bEl.value; livePreview(); }
      });
      costEl.addEventListener("input", (e) => { p.costs[i].amount = e.target.value; livePreview(); });
      bEl.addEventListener("input", (e) => { p.costs[i].batches = Math.max(1, Number(e.target.value) || 1); livePreview(); });
      row.querySelector(".ing-del").addEventListener("click", () => { p.costs.splice(i, 1); if (!p.costs.length) p.costs.push({ name: "", amount: "", batches: 1 }); refreshIngs(); });
    });
  }
  $("#addIng", dlg).addEventListener("click", () => { p.costs.push({ name: "", amount: "", batches: 1 }); refreshIngs(); });
  wireIngs();

  function readInputs() {
    p.name = $("#pName", dlg).value.trim();
    p.price = Number($("#pPrice", dlg).value) || 0;
    const st = $("#pStock", dlg).value; p.stock = st === "" ? undefined : Number(st) || 0;
    p.batchYield = Math.max(1, Number($("#pYield", dlg).value) || 1);
  }
  function livePreview() {
    readInputs();
    const batch = (p.costs || []).reduce((s, c) => s + (Number(c.amount) || 0) / (Number(c.batches) || 1), 0);
    const yld = Math.max(1, Number(p.batchYield) || 1);
    const perUnit = batch / yld;
    const price = Number(p.price) || Number(p.variants?.[0]?.price) || 0;
    const profit = price - perUnit, mp = price > 0 ? (profit / price) * 100 : 0, band = marginBand(mp);
    $("#costReadout", dlg).innerHTML = batch === 0
      ? `<span class="help" style="margin:0">Add what you bought above to see the true cost per unit.</span>`
      : yld > 1
        ? `<div>This batch costs <b>${naira(batch)}</b> and makes <b>${yld}</b>.</div><div style="font-family:var(--display);font-weight:800;font-size:22px;margin-top:4px">${naira(perUnit)} <span style="font-size:.6em;color:var(--ink-3);font-weight:700">per unit</span></div>`
        : `<div>It costs <b style="font-family:var(--display)">${naira(perUnit)}</b> to make one.</div>`;
    $("#livePreview", dlg).innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><div class="help" style="font-weight:700;margin:0">Profit per unit</div>
        <div style="font-family:var(--display);font-weight:800;font-size:24px;color:${profit < 0 ? "var(--warn)" : "var(--ink)"}">${price ? naira(profit, { sign: profit > 0 }) : "—"}</div></div>
      ${price ? `<div class="margin-tag ${band}" style="font-size:13px;padding:5px 11px">${pct(mp)} margin</div>` : ""}</div>`;
  }
  $("#pName", dlg).addEventListener("input", livePreview);
  $("#pPrice", dlg).addEventListener("input", livePreview);
  livePreview();

  $("#saveProduct", dlg).addEventListener("click", () => {
    readInputs();
    if (!p.name) return toast("Give the product a name.", "bad");
    if (!p.price && !p.variants.some((v) => Number(v.price) > 0)) return toast("Add a selling price (or a flavor price).", "bad");
    p.costs = p.costs.filter((c) => (c.name || "").trim() || c.amount)
      .map((c) => ({ name: (c.name || "Cost").trim(), amount: Number(c.amount) || 0, batches: Math.max(1, Number(c.batches) || 1) }));
    p.variants = p.variants.filter((v) => (v.name || "").trim())
      .map((v) => ({ name: v.name.trim(), price: Number(v.price) || 0 }));
    if (!p.price && p.variants.length) p.price = p.variants.find((v) => v.price > 0)?.price || 0; // base price for profit/sales
    Store.rememberIngredients(p.costs);
    Store.upsertProduct(p); closeDialog();
    toast(editing ? "Product updated." : "Product added.", "good"); go(currentRoute());
  });
  $("#delProduct", dlg)?.addEventListener("click", () => {
    Store.deleteProduct(p.id); closeDialog(); toast("Product deleted."); go("products");
  });
}
function ingLineHTML(c) {
  return `<div class="ing-line">
    <input class="input ing-name" list="ingList" placeholder="What did you buy? e.g. condensed milk" value="${esc(c.name ?? "")}"/>
    <div class="ing-row">
      <div class="input-money" style="flex:1;min-width:120px"><span class="sym">₦</span><input class="input ing-cost" inputmode="numeric" placeholder="what it cost" value="${c.amount ?? ""}" style="padding-left:26px"/></div>
      <div class="ing-lasts">lasts <input class="input ing-b" inputmode="numeric" value="${c.batches ?? 1}"/> batch(es)</div>
      <button type="button" class="ing-del" aria-label="Remove">${icon("x", 16)}</button>
    </div></div>`;
}
function flavorLineHTML(v) {
  return `<div class="flavor-line">
    <input class="input fl-name" placeholder="Flavor e.g. Mango" value="${esc(v?.name ?? "")}" style="flex:1"/>
    <div class="input-money fl-price" style="width:130px"><span class="sym">₦</span><input class="input" inputmode="numeric" placeholder="price" value="${v?.price ?? ""}" style="padding-left:26px"/></div>
    <button type="button" class="fl-del cl-del" aria-label="Remove">${icon("x", 16)}</button></div>`;
}
function overheadLineHTML(o) {
  return `<div class="oh-line">
    <input class="input oh-name" placeholder="e.g. Shop rent" value="${esc(o?.name ?? "")}" style="flex:1;min-width:130px"/>
    <div class="input-money oh-amt" style="width:120px"><span class="sym">₦</span><input class="input" inputmode="numeric" placeholder="0" value="${o?.amount ?? ""}" style="padding-left:26px"/></div>
    <select class="select oh-period" style="width:104px">
      <option value="month" ${o?.period !== "year" ? "selected" : ""}>/ month</option>
      <option value="year" ${o?.period === "year" ? "selected" : ""}>/ year</option>
    </select>
    <button type="button" class="oh-del cl-del" aria-label="Remove">${icon("x", 16)}</button></div>`;
}

/* ============================================================
   PRICING — the calculator
   ============================================================ */
export const Calculator = {
  html(params = {}) {
    const products = Store.products();
    const target = Store.business().targetMargin;
    return `
      ${pageHead({ title: "Pricing", intro: "Enter your cost, then check a price you already charge, or get one that hits your target." })}
      <div class="split">
        <div class="card">
          <div class="segment" id="mode"><button data-mode="check" class="on">Check my price</button><button data-mode="suggest">Suggest a price</button></div>
          ${products.length ? `<div class="field" style="margin-top:16px"><label>Load a product</label>
            <select class="select" id="loadProduct"><option value="">Start blank</option>
              ${products.map((p) => `<option value="${p.id}" ${p.id === params.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}
          <div class="field"><label>Cost to make one</label>
            <div class="input-money"><span class="sym">₦</span><input class="input" id="cCost" inputmode="numeric" placeholder="0"/></div>
            <p class="help">Materials, packaging, transport, gas — your direct cost per unit.</p></div>
          <div class="field" id="ohField">
            <label class="oh-toggle"><input type="checkbox" id="cOh"/><span>Add my running costs</span><span class="oh-amt" id="ohAmt"></span></label>
            <p class="help" id="ohHint"></p></div>
          <div class="field" id="priceField"><label>Your selling price</label>
            <div class="input-money"><span class="sym">₦</span><input class="input" id="cPrice" inputmode="numeric" placeholder="0"/></div></div>
          <div class="field" id="marginField" hidden><label>Target margin: <span id="tmVal">${target}%</span></label>
            <input type="range" id="cMargin" min="10" max="70" step="5" value="${target}" style="width:100%"/></div>
        </div>
        <div id="calcOut"><div class="card" style="color:var(--ink-3)"><p class="help" style="margin:0">Your result shows here once you enter a cost.</p></div></div>
      </div>
    `;
  },
  mount(root, params = {}) {
    let mode = "check";
    const cCost = $("#cCost", root), cPrice = $("#cPrice", root), cMargin = $("#cMargin", root), cOh = $("#cOh", root);

    // running-costs toggle setup
    const oh = overheadPerUnit();
    if (oh > 0) {
      $("#ohAmt", root).textContent = `+${naira(oh)} per unit`;
      $("#ohHint", root).textContent = "Spreads rent, staff and other running costs into this unit, so the price covers everything.";
    } else {
      cOh.disabled = true;
      $("#ohField", root).style.opacity = ".6";
      $("#ohHint", root).innerHTML = `Add your running costs in <a class="link" data-goto="settings">Business settings</a> to include them here.`;
      $("#ohHint", root).querySelector("[data-goto]")?.addEventListener("click", () => go("settings"));
    }

    function loadProduct(id) {
      const p = Store.product(id);
      if (!p) { cCost.value = ""; cPrice.value = ""; } else { cCost.value = Math.round(unitCost(p)); cPrice.value = productPrice(p); }
      render();
    }
    $("#loadProduct", root)?.addEventListener("change", (e) => loadProduct(e.target.value));
    if (params.id) loadProduct(params.id);
    $$("#mode button", root).forEach((btn) => btn.addEventListener("click", () => {
      $$("#mode button", root).forEach((x) => x.classList.remove("on")); btn.classList.add("on");
      mode = btn.dataset.mode;
      $("#priceField", root).hidden = mode !== "check";
      $("#marginField", root).hidden = mode !== "suggest"; render();
    }));
    cMargin?.addEventListener("input", () => { $("#tmVal", root).textContent = cMargin.value + "%"; render(); });
    cOh?.addEventListener("change", render);
    [cCost, cPrice].forEach((el) => el.addEventListener("input", render));

    function render() {
      const materials = Number(cCost.value) || 0, out = $("#calcOut", root);
      const ohAdd = (cOh && cOh.checked && oh > 0) ? oh : 0;
      const cost = materials + ohAdd;
      const ohNote = ohAdd > 0 ? `<div class="rmsg" style="margin-top:8px;opacity:.85">Includes ${naira(ohAdd)} running costs per unit (materials ${naira(materials)} + overhead ${naira(ohAdd)}).</div>` : "";
      if (!materials) { out.innerHTML = `<div class="card" style="color:var(--ink-3)"><p class="help" style="margin:0">Your result shows here once you enter a cost.</p></div>`; return; }
      if (mode === "check") {
        const price = Number(cPrice.value) || 0;
        if (!price) { out.innerHTML = `<div class="card" style="color:var(--ink-3)"><p class="help" style="margin:0">Enter your selling price to see the margin.</p></div>`; return; }
        const profit = price - cost, m = (profit / price) * 100;
        const target = Number(cMargin?.value) || Store.business().targetMargin, healthy = m >= 30;
        const suggested = Math.ceil((cost / (1 - target / 100)) / 50) * 50;
        out.innerHTML = `<div class="readout ${healthy ? "ok" : "warn"}">
          <div class="rl">You make</div><div class="rv">${naira(profit)} <small>per unit</small></div>
          <div class="rmsg">That works out to <b>${pct(m)}</b> margin. ${healthy ? "Healthy. Most makers aim for 30% or more, and you are there." : "Most makers aim for 30% or more. You are leaving money on the table."}</div>
          ${!healthy ? `<div class="move">Your move: to reach <b>${target}%</b>, sell at <b>${naira(suggested)}</b>. That is ${naira(suggested - price)} more per unit.</div>` : ""}
          ${ohNote}</div>
          ${!healthy ? `<button class="btn accent block" id="useSuggest" style="margin-top:12px">Use ${naira(suggested)} as my price</button>` : ""}`;
        $("#useSuggest", root)?.addEventListener("click", () => { cPrice.value = suggested; render(); toast("Price updated in the calculator."); });
      } else {
        const target = Number(cMargin.value) || 35, price = Math.ceil((cost / (1 - target / 100)) / 50) * 50;
        out.innerHTML = `<div class="readout ok"><div class="rl">To keep a ${target}% margin, sell at</div>
          <div class="rv">${naira(price)}</div><div class="rmsg">You would make <b>${naira(price - cost)}</b> on every unit.</div>${ohNote}</div>`;
      }
    }
    render();
  },
};

/* ============================================================
   SALES — the retention loop
   ============================================================ */
export const Sales = {
  html(params = {}) {
    const period = params.period || "week";
    const s = stats(period);
    const segs = Object.entries(s.byProduct)
      .map(([id, val], i) => ({ id, value: Math.max(0, val), color: SEG_COLORS[i % SEG_COLORS.length], label: Store.product(id)?.name || "?" }))
      .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    return `
      ${pageHead({ title: "Sales", intro: "Log a sale, send a receipt, watch profit rise.",
        actions: [{ id: "log", label: "Log a sale", icon: "plus", kind: "accent" }] })}
      <div class="pill-row" style="margin-bottom:18px">
        ${["today", "week", "month"].map((p) => `<button class="pill ${p === period ? "on" : ""}" data-period="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}
      </div>
      <div class="grid cols-3" style="margin-bottom:16px">
        <div class="kpi"><div class="k">Profit</div><div class="v" style="color:var(--good)">${naira(s.profit)}</div></div>
        <div class="kpi"><div class="k">Revenue</div><div class="v">${naira(s.revenue)}</div></div>
        <div class="kpi"><div class="k">${s.count} ${s.count === 1 ? "sale" : "sales"}${s.owing > 0 ? ", owing" : ""}</div><div class="v">${s.owing > 0 ? naira(s.owing) : "—"}</div></div>
      </div>
      <div class="split">
        <div class="card"><div class="section-title">Log</div>${salesLog(period)}
          <button class="btn ghost block" data-log style="margin-top:14px">${icon("plus", 18)} Log a sale</button></div>
        <div class="card"><div class="section-title">Where profit comes from</div>
          ${segs.length ? `<div class="donut-wrap" style="flex-direction:column;align-items:stretch">
            <div style="align-self:center">${donut(segs, naira(s.profit), period)}</div>
            <div class="legend" style="margin-top:16px">${segs.map((x) => `<div class="li"><span class="sw" style="background:${x.color}"></span>${esc(x.label)}<span class="amt">${naira(x.value)}</span></div>`).join("")}</div>
          </div>` : `<p class="help">No sales in this window yet.</p>`}</div>
      </div>
    `;
  },
  mount(root) {
    $$("[data-period]", root).forEach((el) => el.addEventListener("click", () => go("sales", { period: el.dataset.period })));
    $("[data-act='log']", root)?.addEventListener("click", () => openLogSale());
    $$("[data-log]", root).forEach((el) => el.addEventListener("click", () => openLogSale()));
    $$("[data-receipt]", root).forEach((el) => el.addEventListener("click", () => openReceipt(el.dataset.receipt)));
  },
};
function salesLog(period) {
  const list = Store.sales().filter((s) => withinPeriod(s.at, period));
  if (!list.length) return `<p class="help">No sales in this window yet.</p>`;
  return list.map((s) => {
    const p = Store.product(s.productId); if (!p) return "";
    return `<div class="act"><span class="ai">${pThumb(p)}</span>
      <span class="info"><b>${esc(p.name)}</b><span>${s.qty} × ${naira(p.price)} · ${ago(s.at)}${s.paid ? "" : " · <b style='color:var(--mango)'>owing</b>"}</span></span>
      <button class="btn ghost sm" data-receipt="${s.id}">Receipt</button></div>`;
  }).join("");
}

/* ---------- log a sale (dialog) ---------- */
export function openLogSale() {
  const products = Store.products();
  if (!products.length) { toast("Add a product first."); go("products"); return; }
  let sel = products[0].id, qty = 1, paid = true;
  const dlg = openDialog(`
    <div class="field"><label>Product</label>
      <select class="select" id="lProduct">${products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${naira(p.price)}</option>`).join("")}</select></div>
    <div class="two-col">
      <div class="field"><label>Quantity</label><input class="input" id="lQty" inputmode="numeric" value="1" style="font-family:var(--display);font-weight:600;text-align:center"/></div>
      <div class="field"><label>Payment</label><div class="segment" id="lPaid" style="width:100%"><button data-paid="1" class="on" style="flex:1">Paid</button><button data-paid="0" style="flex:1">Owing</button></div></div>
    </div>
    <div class="card" id="lPreview" style="background:var(--surface-2);border:0;padding:14px 16px"></div>
    <div class="actions"><button class="btn ghost" data-close>Cancel</button>
      <button class="btn accent" id="lSave">${icon("check",18)} Log and make receipt</button></div>
  `, { title: "Log a sale" });

  function preview() {
    const p = Store.product(sel), prof = unitProfit(p) * qty;
    $("#lPreview", dlg).innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><div class="help" style="font-weight:700;margin:0">This sale</div><div style="font-size:14px;margin-top:2px">${qty} × ${esc(p.name)}</div></div>
      <div style="text-align:right"><div class="help" style="margin:0">profit</div><div style="font-family:var(--display);font-weight:600;font-size:22px;color:var(--good)">${naira(prof, { sign: prof > 0 })}</div></div></div>`;
  }
  $("#lProduct", dlg).addEventListener("change", (e) => { sel = e.target.value; preview(); });
  $("#lQty", dlg).addEventListener("input", (e) => { qty = Math.max(1, Number(e.target.value) || 1); preview(); });
  $$("#lPaid button", dlg).forEach((btn) => btn.addEventListener("click", () => {
    $$("#lPaid button", dlg).forEach((x) => x.classList.remove("on")); btn.classList.add("on"); paid = btn.dataset.paid === "1";
  }));
  preview();
  $("#lSave", dlg).addEventListener("click", () => {
    const sale = { id: newId("s"), productId: sel, qty, at: Date.now(), paid };
    Store.addSale(sale); closeDialog(); openReceipt(sale.id, true);
  });
}

/* ---------- receipt (dialog) ---------- */
function openReceipt(saleId, justLogged = false) {
  const s = Store.sales().find((x) => x.id === saleId);
  const p = Store.product(s.productId), b = Store.business();
  const total = (Number(p.price) || 0) * s.qty, date = fmtDate(s.at);
  const text = [`*${b.name}* — Receipt`, date, ``, `${p.emoji || "•"} ${p.name}`, `${s.qty} × ${naira(p.price)}`, `Total: ${naira(total)}`, s.paid ? `Status: Paid ✅` : `Status: Owing`, ``, `Thank you for your order 💛`].join("\n");
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const dlg = openDialog(`
    ${justLogged ? `<div style="text-align:center;margin-bottom:16px">
      <div class="ill" style="width:52px;height:52px;background:var(--good-50);color:var(--good);margin:0 auto 10px;border-radius:14px;display:grid;place-items:center">${icon("check",28)}</div>
      <div style="font-family:var(--serif);font-size:20px">Sale logged. Profit is rising.</div></div>` : ""}
    <div class="receipt">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="r-brand">${esc(b.name)}</span><span class="help" style="margin:0">${date}</span></div>
      <div style="margin:12px 0 4px;font-weight:700">${p.emoji || ""} ${esc(p.name)}</div>
      <div class="r-line"><span>${s.qty} × ${naira(p.price)}</span><span>${naira(total)}</span></div>
      <div class="r-line total"><span>Total</span><span>${naira(total)}</span></div>
      <div class="r-line"><span class="help" style="margin:0">Status</span><span style="color:${s.paid ? "var(--good)" : "var(--mango)"};font-weight:700">${s.paid ? "Paid" : "Owing"}</span></div>
    </div>
    <div class="actions"><button class="btn ghost" data-close>Done</button>
      <a class="btn wa" href="${wa}" target="_blank" rel="noopener">${icon("share",18)} Send on WhatsApp</a></div>
  `, { title: justLogged ? "" : "Receipt" });
  dlg.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => go(currentRoute())));
}

/* ============================================================
   INVOICES — the invoice generator
   ============================================================ */
export const Invoices = {
  html() {
    const list = Store.invoices();
    const outstanding = list.filter((i) => invEffectiveStatus(i) !== "paid" && i.status !== "draft").reduce((s, i) => s + invTotal(i), 0);
    const paidMonth = list.filter((i) => i.status === "paid" && withinPeriod(i.issuedAt, "month")).reduce((s, i) => s + invTotal(i), 0);
    return `
      ${pageHead({ title: "Invoices", intro: "Send a clean invoice, track what is owed, mark it paid when the money lands.",
        actions: [{ id: "new", label: "New invoice", icon: "plus", kind: "accent" }] })}
      <div class="grid cols-3" style="margin-bottom:20px">
        <div class="kpi"><div class="row"><span class="ic owe">${icon("cal",18)}</span></div><div class="k">Outstanding</div><div class="v">${naira(outstanding)}</div></div>
        <div class="kpi"><div class="row"><span class="ic prof">${icon("check",18)}</span></div><div class="k">Paid this month</div><div class="v">${naira(paidMonth)}</div></div>
        <div class="kpi"><div class="row"><span class="ic rev">${icon("invoice",18)}</span></div><div class="k">Invoices</div><div class="v">${list.length}</div></div>
      </div>
      ${list.length ? `<div class="card" style="padding:8px 6px">
        <table class="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Status</th><th class="r">Amount</th></tr></thead>
        <tbody>${list.map(invoiceRow).join("")}</tbody></table></div>` : emptyInvoices()}
    `;
  },
  mount(root) {
    $("[data-act='new']", root)?.addEventListener("click", () => openInvoiceEditor());
    $("[data-new-empty]", root)?.addEventListener("click", () => openInvoiceEditor());
    $$("[data-inv]", root).forEach((el) => el.addEventListener("click", () => openInvoiceDoc(el.dataset.inv)));
  },
};
function invoiceRow(inv) {
  const st = invEffectiveStatus(inv);
  return `<tr data-inv="${inv.id}" style="cursor:pointer">
    <td><b style="font-family:var(--display);font-weight:600">${esc(inv.number)}</b></td>
    <td>${esc(inv.customer?.name || "—")}</td>
    <td class="help" style="margin:0">${fmtDate(inv.issuedAt)}</td>
    <td><span class="status ${st}"><span class="d"></span>${st[0].toUpperCase() + st.slice(1)}</span></td>
    <td class="r money">${naira(invTotal(inv))}</td></tr>`;
}
function emptyInvoices() {
  return `<div class="empty"><div class="ill">${icon("invoice", 30)}</div>
    <h3>No invoices yet</h3>
    <p>Bill a customer for one or more products. Trackit numbers it, totals it, and gives you a link to send.</p>
    <button class="btn accent" data-new-empty>Create your first invoice</button></div>`;
}

/* ---------- invoice editor (dialog, wide) ---------- */
function openInvoiceEditor(id) {
  const editing = id ? Store.invoice(id) : null;
  const inv = editing ? structuredClone(editing) : {
    id: newId("in"), number: Store.nextInvoiceNumber(), customer: { name: "", phone: "" },
    items: [], discount: "", issuedAt: Date.now(), dueAt: Date.now() + 7 * 86400000, status: "draft", note: "",
  };
  if (!inv.items.length) inv.items = [{ name: "", qty: 1, price: "", cost: 0 }];
  const products = Store.products();

  const dlg = openDialog(`
    <div class="two-col">
      <div class="field"><label>Bill to (customer name)</label><input class="input" id="cName" placeholder="e.g. Chidinma O." value="${esc(inv.customer.name)}"/></div>
      <div class="field"><label>Customer WhatsApp <span class="help" style="display:inline">optional</span></label><input class="input" id="cPhone" inputmode="numeric" placeholder="2348…" value="${esc(inv.customer.phone)}"/></div>
    </div>
    <div class="field"><label>Items</label><div class="cost-lines" id="invItems"></div>
      <button type="button" class="add-cost" id="addItem">${icon("plus", 15)} Add item</button></div>
    <div class="two-col">
      <div class="field"><label>Discount <span class="help" style="display:inline">optional</span></label><div class="input-money"><span class="sym">₦</span><input class="input" id="iDiscount" inputmode="numeric" placeholder="0" value="${inv.discount}"/></div></div>
      <div class="field"><label>Due date</label><input class="input" type="date" id="iDue" value="${fmtDateInput(inv.dueAt)}"/></div>
    </div>
    <div class="field"><label>Note <span class="help" style="display:inline">optional</span></label><textarea class="input" id="iNote" placeholder="Payment on delivery. Bank transfer to…">${esc(inv.note)}</textarea></div>
    <div class="card" id="invTotals" style="background:var(--surface-2);border:0;padding:14px 16px"></div>
    <div class="actions"><button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" id="saveInv">${editing ? "Save invoice" : "Create invoice"}</button></div>
  `, { title: `${editing ? "Edit" : "New"} invoice · ${inv.number}`, wide: true });

  function itemRowHTML(it, i) {
    return `<div class="cost-line" data-i="${i}" style="flex-wrap:wrap">
      <input class="input it-name" list="prodList" placeholder="Item name" value="${esc(it.name ?? "")}" style="flex:1;min-width:150px"/>
      <input class="input it-qty" inputmode="numeric" value="${it.qty ?? 1}" title="Qty" style="width:64px;text-align:center"/>
      <div class="input-money it-price" style="width:130px"><span class="sym">₦</span><input class="input" inputmode="numeric" placeholder="price" value="${it.price ?? ""}" style="padding-left:26px"/></div>
      <button type="button" class="cl-del it-del" aria-label="Remove">${icon("x", 16)}</button></div>`;
  }
  function renderItems() {
    $("#invItems", dlg).innerHTML = inv.items.map(itemRowHTML).join("") +
      `<datalist id="prodList">${products.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>`;
    $$("#invItems .cost-line", dlg).forEach((row) => {
      const i = Number(row.dataset.i);
      const nameEl = row.querySelector(".it-name"), qtyEl = row.querySelector(".it-qty"), priceEl = row.querySelector(".it-price input");
      nameEl.addEventListener("input", (e) => {
        inv.items[i].name = e.target.value;
        const match = products.find((p) => p.name.toLowerCase() === e.target.value.trim().toLowerCase());
        if (match) { inv.items[i].price = match.price; inv.items[i].cost = unitCost(match); priceEl.value = match.price; }
        totals();
      });
      qtyEl.addEventListener("input", (e) => { inv.items[i].qty = Math.max(1, Number(e.target.value) || 1); totals(); });
      priceEl.addEventListener("input", (e) => { inv.items[i].price = Number(e.target.value) || 0; totals(); });
      row.querySelector(".it-del").addEventListener("click", () => { inv.items.splice(i, 1); if (!inv.items.length) inv.items.push({ name: "", qty: 1, price: "", cost: 0 }); renderItems(); totals(); });
    });
  }
  $("#addItem", dlg).addEventListener("click", () => { inv.items.push({ name: "", qty: 1, price: "", cost: 0 }); renderItems(); totals(); });

  function readMeta() {
    inv.customer.name = $("#cName", dlg).value.trim();
    inv.customer.phone = $("#cPhone", dlg).value.replace(/\D/g, "");
    inv.discount = Number($("#iDiscount", dlg).value) || 0;
    inv.note = $("#iNote", dlg).value.trim();
    const due = $("#iDue", dlg).value; if (due) inv.dueAt = new Date(due).getTime();
  }
  function totals() {
    readMeta();
    const sub = invSubtotal(inv), tot = Math.max(0, sub - (Number(inv.discount) || 0)), profit = tot - invCost(inv);
    $("#invTotals", dlg).innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0"><span class="help" style="margin:0">Subtotal</span><span class="money">${naira(sub)}</span></div>
      ${inv.discount ? `<div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0"><span class="help" style="margin:0">Discount</span><span class="money">−${naira(inv.discount)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;padding:6px 0 2px;border-top:1px solid var(--line);margin-top:6px"><span>Total</span><span style="font-family:var(--display);font-weight:600">${naira(tot)}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-3);padding-top:4px"><span>Your profit on this invoice</span><span>${naira(profit)}</span></div>`;
  }
  ["#cName", "#cPhone", "#iDiscount", "#iNote", "#iDue"].forEach((s) => $(s, dlg).addEventListener("input", totals));
  renderItems(); totals();

  $("#saveInv", dlg).addEventListener("click", () => {
    readMeta();
    if (!inv.customer.name) return toast("Add who this is billed to.", "bad");
    inv.items = inv.items.filter((it) => (it.name || "").trim() && Number(it.price) > 0)
      .map((it) => ({ name: it.name.trim(), qty: Number(it.qty) || 1, price: Number(it.price) || 0, cost: Number(it.cost) || 0 }));
    if (!inv.items.length) return toast("Add at least one item with a price.", "bad");
    Store.upsertInvoice(inv); closeDialog();
    toast(editing ? "Invoice saved." : "Invoice created.", "good");
    openInvoiceDoc(inv.id);
  });
}

/* ---------- invoice document (editorial, matches the reference) ---------- */
export function invoiceDocHTML(inv) {
  const b = Store.business();
  const sub = invSubtotal(inv), tot = invTotal(inv);
  const MIN_ROWS = 6;
  const rows = inv.items.map((it) => `<tr>
    <td class="desc">${esc(it.name)}</td>
    <td class="r">${String(it.qty).padStart(2, "0")}</td>
    <td class="r">${naira(it.price)}</td>
    <td class="r money">${naira(it.price * it.qty)}</td></tr>`).join("");
  const fillers = Array.from({ length: Math.max(0, MIN_ROWS - inv.items.length) },
    () => `<tr class="filler"><td class="desc">.</td><td class="r">.</td><td class="r">.</td><td class="r">.</td></tr>`).join("");

  const co = b.logo
    ? `<img src="${b.logo}" alt="${esc(b.name)}"/>`
    : `<div class="co-name">${esc(b.name)}</div>`;
  const terms = inv.note || "Payment is due by the date above. Thank you for choosing us.";

  return `<div class="invoice-doc">
    <div class="inv-top">
      <div class="inv-title">INVOICE</div>
      <div class="inv-co">${co}</div>
    </div>
    <div class="inv-meta">
      <div>
        <div>Invoice No: ${esc(inv.number)}</div>
        <div>Date: ${fmtDate(inv.issuedAt)}</div>
        <div>Due Date: ${fmtDate(inv.dueAt)}</div>
      </div>
      <div class="r">
        ${b.address ? esc(b.address).split("\n").map((l) => `<div>${l}</div>`).join("") : `<div>${esc(b.name)}</div>`}
        ${b.whatsapp ? `<div>+${esc(b.whatsapp)}</div>` : ""}
      </div>
    </div>
    <div class="inv-parties">
      <div>
        <h4>Bill To:</h4>
        <div class="who">${esc(inv.customer.name || "—")}</div>
        ${inv.customer.phone ? `<div>+${esc(inv.customer.phone)}</div>` : ""}
      </div>
      <div class="r">
        <h4>Payment Method</h4>
        ${b.payment ? esc(b.payment).split("\n").map((l) => `<div>${l}</div>`).join("") : `<div>WhatsApp / transfer</div><div class="who">${esc(b.owner)}</div>`}
      </div>
    </div>
    <div class="doc-scroll"><table>
      <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Subtotal</th></tr></thead>
      <tbody>
        ${rows}${fillers}
        ${inv.discount ? `<tr class="sumrow"><td class="lbl" colspan="3">Discount</td><td class="r money">−${naira(inv.discount)}</td></tr>` : ""}
        <tr class="sumrow"><td class="lbl" colspan="3">Subtotal</td><td class="r money">${naira(sub)}</td></tr>
        <tr class="sumrow grand"><td class="lbl" colspan="3">Grand Total</td><td class="r money">${naira(tot)}</td></tr>
      </tbody>
    </table></div>
    <div class="inv-foot">
      <div>
        <h5>Term &amp; Condition</h5>
        <p>${esc(terms)}</p>
      </div>
      <div>
        <h5>For any questions</h5>
        <p>${b.whatsapp ? "Contact +" + esc(b.whatsapp) : "Contact us anytime."}<br/>${esc(b.owner)}</p>
      </div>
      <div class="inv-sign">
        <div class="sig">${esc(b.owner || b.name)}</div>
        <div class="who">${esc(b.owner || b.name)}</div>
        <div class="role">Owner</div>
      </div>
    </div>
  </div>`;
}

function printDoc(html) {
  const root = document.getElementById("printRoot");
  root.innerHTML = html;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); root.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1500); // fallback if afterprint doesn't fire
}

function openInvoiceDoc(id) {
  const inv = Store.invoice(id); if (!inv) return;
  const b = Store.business();
  const tot = invTotal(inv);
  const waText = [`*${b.name}* — Invoice ${inv.number}`, `Bill to: ${inv.customer.name}`, ``,
    ...inv.items.map((it) => `${it.qty} × ${it.name} — ${naira(it.price * it.qty)}`),
    inv.discount ? `Discount: −${naira(inv.discount)}` : ``, `*Total: ${naira(tot)}*`, ``,
    `Due ${fmtDate(inv.dueAt)}.`, inv.note || `Thank you.`].filter((x) => x !== ``).join("\n");
  const wa = inv.customer.phone ? `https://wa.me/${inv.customer.phone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const dlg = openDialog(`
    ${invoiceDocHTML(inv)}
    <div class="actions" style="flex-wrap:wrap">
      <button class="btn ghost" id="editInv">${icon("edit",17)} Edit</button>
      <button class="btn ghost" id="printInv">${icon("print",17)} Print / PDF</button>
      ${inv.status !== "paid" ? `<button class="btn ghost" id="markPaid" style="color:var(--good)">${icon("check",17)} Mark paid</button>` : ""}
      <a class="btn wa" href="${wa}" target="_blank" rel="noopener">${icon("share",17)} Send on WhatsApp</a>
    </div>
  `, { title: "", wide: true });

  $("#editInv", dlg).addEventListener("click", () => { closeDialog(); openInvoiceEditor(inv.id); });
  $("#printInv", dlg).addEventListener("click", () => printDoc(invoiceDocHTML(inv)));
  $("#markPaid", dlg)?.addEventListener("click", () => { Store.setInvoiceStatus(inv.id, "paid"); closeDialog(); toast("Marked as paid.", "good"); go("invoices"); });
  $(".btn.wa", dlg)?.addEventListener("click", () => { if (inv.status === "draft") Store.setInvoiceStatus(inv.id, "sent"); });
}

/* ============================================================
   SHOP
   ============================================================ */
export const Shop = {
  html() {
    const b = Store.business(), list = Store.products();
    const url = `trackit.shop/${b.shopSlug}`;
    return `
      ${pageHead({ title: "Your shop", intro: "Your product list, made public. Share the link, buyers order straight to your WhatsApp.",
        actions: [{ id: "preview", label: "Preview shop", icon: "arrowRight", kind: "ghost" }] })}
      <div class="card" style="margin-bottom:20px">
        <div class="link-box"><span class="u">${url}</span>
          <button class="btn primary sm" id="copyLink">${icon("copy",16)} Copy link</button>
          <button class="btn wa sm" id="shareLink">${icon("share",16)} Share</button></div>
      </div>
      <div class="sec-head"><h2>In your shop</h2><span class="help" style="margin:0">${list.length} items</span></div>
      ${list.length ? `<div class="shop-grid">${list.map((p) => `<div class="shop-card"><div class="ph">${pThumb(p)}</div>
        <div class="cap"><b>${esc(p.name)}</b><div class="pr">${priceLabel(p)}</div>${flavorNames(p) ? `<div class="help" style="margin:2px 0 0;font-size:11.5px">${flavorNames(p)}</div>` : ""}</div></div>`).join("")}</div>`
        : `<div class="empty"><p>Add products to fill your shop.</p></div>`}
    `;
  },
  mount(root) {
    const b = Store.business(), url = `https://trackit.shop/${b.shopSlug}`;
    $("[data-act='preview']", root)?.addEventListener("click", () => openShopPreview());
    $("#copyLink", root)?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("Link copied.", "good"); } catch { toast(url); }
    });
    $("#shareLink", root)?.addEventListener("click", () => {
      const text = `Shop ${b.name} here: ${url}`;
      if (navigator.share) navigator.share({ title: b.name, text, url }).catch(() => {});
      else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    });
  },
};
function openShopPreview() {
  const b = Store.business(), list = Store.products();
  const entries = [];
  for (const p of list) {
    if (p.variants?.length) for (const v of p.variants) entries.push({ p, label: `${p.name} — ${v.name}`, price: Number(v.price) || productPrice(p) });
    else entries.push({ p, label: p.name, price: productPrice(p) });
  }
  openDialog(`<p class="help" style="margin:-6px 0 16px">This is what a buyer sees.</p>
    <div class="shop-grid">${entries.map((e) => {
      const order = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(`Hi ${b.name}, I want to order: ${e.label} (${naira(e.price)})`)}`;
      return `<div class="shop-card"><div class="ph">${pThumb(e.p)}</div>
        <div class="cap"><b>${esc(e.label)}</b><div class="pr">${naira(e.price)}</div>
          <a class="btn wa sm block" href="${order}" target="_blank" rel="noopener" style="margin-top:8px;justify-content:center">Order</a></div></div>`;
    }).join("")}</div>
    <div class="actions"><button class="btn ghost block" data-close>Close preview</button></div>`, { title: esc(b.name), wide: true });
}

/* ============================================================
   SETTINGS
   ============================================================ */
export const Settings = {
  html() {
    const b = Store.business();
    return `
      ${pageHead({ title: "Business", intro: "These details power your receipts, invoices and shop." })}
      <div class="card" style="max-width:560px">
        <div class="two-col">
          <div class="field"><label>Business name</label><input class="input" id="sName" value="${esc(b.name)}"/></div>
          <div class="field"><label>Your name</label><input class="input" id="sOwner" value="${esc(b.owner)}"/></div>
        </div>
        <div class="field"><label>WhatsApp number</label><input class="input" id="sWa" inputmode="numeric" value="${esc(b.whatsapp)}"/>
          <p class="help">Country code and number, no plus. Orders from your shop land here.</p></div>
        <div class="field"><label>Shop link name</label>
          <div class="input-money"><span class="sym" style="left:13px;font-size:13px">trackit.shop/</span><input class="input" id="sSlug" value="${esc(b.shopSlug)}" style="padding-left:100px"/></div></div>
        <div class="field"><label>Healthy margin target: <span id="tmv">${b.targetMargin}%</span></label>
          <input type="range" id="sTarget" min="15" max="60" step="5" value="${b.targetMargin}" style="width:100%"/></div>
        <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="sSave">Save changes</button></div>
      </div>

      <div class="sec-head" style="max-width:560px"><h2>Logo &amp; invoice details</h2></div>
      <div class="card" style="max-width:560px">
        <div class="field"><label>Business logo</label>
          <div class="logo-row">
            <div class="logo-preview" id="logoPreview">${b.logo ? `<img src="${b.logo}" alt=""/>` : icon("upload", 22)}</div>
            <div>
              <input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" hidden/>
              <button class="btn ghost sm" id="logoPick">${icon("upload", 16)} Upload logo</button>
              <button class="btn ghost sm" id="logoRemove" style="color:var(--warn)" ${b.logo ? "" : "hidden"}>Remove</button>
              <p class="help">PNG or JPG. Appears on your invoices and in the sidebar.</p>
            </div>
          </div>
        </div>
        <div class="field"><label>Business address <span class="help" style="display:inline">optional</span></label>
          <textarea class="input" id="sAddress" placeholder="12 Market Rd, Lagos">${esc(b.address || "")}</textarea></div>
        <div class="field"><label>Payment details <span class="help" style="display:inline">optional</span></label>
          <textarea class="input" id="sPayment" placeholder="GTBank 0123456789 — ${esc(b.name)}">${esc(b.payment || "")}</textarea>
          <p class="help">Shown as “Payment Method” on your invoices.</p></div>
        <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="sSaveInv">Save invoice details</button></div>
      </div>

      <div class="sec-head" style="max-width:560px"><h2>Running costs</h2></div>
      <div class="card" style="max-width:560px">
        <p class="help" style="margin:0 0 12px">Rent, staff, data, fuel, shipping, security. Trackit spreads these across your sales so Pricing can suggest a price that covers everything, not just materials.</p>
        <div id="ohLines">${(b.overheads || []).map(overheadLineHTML).join("")}</div>
        <button type="button" class="add-cost" id="addOverhead">${icon("plus", 15)} Add a running cost</button>
        <div class="field" style="margin-top:14px"><label>How many do you sell in a month? <span class="help" style="display:inline">estimate</span></label>
          <input class="input" id="ohSales" inputmode="numeric" placeholder="e.g. 300" value="${b.monthlySales ?? ""}"/>
          <p class="help">Across all your products. Leave blank to use the sales you log in Trackit.</p></div>
        <div class="card" id="ohReadout" style="background:var(--surface-2);border:0;padding:14px 16px"></div>
        <div class="actions" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="saveOverheads">Save running costs</button></div>
      </div>

      <div class="sec-head" style="max-width:560px"><h2>Billing</h2></div>
      <div class="card" style="max-width:560px">${billingCard()}</div>

      <div class="card" style="max-width:560px;margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:14px">
        <div><b>Log out</b><div class="help" style="margin:0">Sign out of Trackit on this device.</div></div>
        <button class="btn ghost" id="sLogout">Log out</button>
      </div>
    `;
  },
  mount(root) {
    $("#sTarget", root)?.addEventListener("input", (e) => $("#tmv", root).textContent = e.target.value + "%");
    $("#sSave", root)?.addEventListener("click", () => {
      Store.saveBusiness({
        name: $("#sName", root).value.trim() || "My business",
        owner: $("#sOwner", root).value.trim() || "Owner",
        whatsapp: $("#sWa", root).value.replace(/\D/g, ""),
        shopSlug: $("#sSlug", root).value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") || "my-shop",
        targetMargin: Number($("#sTarget", root).value) || 35,
      });
      toast("Saved.", "good"); go("home");
    });
    $("#sLogout", root)?.addEventListener("click", () => logout());

    // running costs (overhead)
    let ohs = (Store.business().overheads || []).map((o) => ({ name: o.name || "", amount: o.amount ?? "", period: o.period || "month" }));
    function ohReadout() {
      const monthly = ohs.reduce((s, o) => s + (o.period === "year" ? (Number(o.amount) || 0) / 12 : (Number(o.amount) || 0)), 0);
      const est = Number($("#ohSales", root).value) || 0;
      const units = est || monthlyUnitsSold();
      const per = units > 0 ? monthly / units : 0;
      $("#ohReadout", root).innerHTML = monthly === 0
        ? `<span class="help" style="margin:0">Add your running costs above to see the cost per unit.</span>`
        : units > 0
          ? `<div>Running costs <b>${naira(monthly)}/month</b>, spread over <b>${units}</b> sales a month.</div>
             <div style="font-family:var(--display);font-weight:800;font-size:22px;margin-top:4px">+${naira(per)} <span style="font-size:.6em;color:var(--ink-3);font-weight:700">per unit</span></div>
             <p class="help" style="margin-top:6px">Turn this on in Pricing to get a price that covers it.</p>`
          : `<span class="help" style="margin:0">Enter how many you sell a month to see the cost per unit.</span>`;
    }
    function refreshOh() { $("#ohLines", root).innerHTML = ohs.map(overheadLineHTML).join(""); wireOh(); ohReadout(); }
    function wireOh() {
      $$("#ohLines .oh-line", root).forEach((row, i) => {
        row.querySelector(".oh-name").addEventListener("input", (e) => { ohs[i].name = e.target.value; });
        row.querySelector(".oh-amt input").addEventListener("input", (e) => { ohs[i].amount = e.target.value; ohReadout(); });
        row.querySelector(".oh-period").addEventListener("change", (e) => { ohs[i].period = e.target.value; ohReadout(); });
        row.querySelector(".oh-del").addEventListener("click", () => { ohs.splice(i, 1); refreshOh(); });
      });
    }
    $("#addOverhead", root)?.addEventListener("click", () => { ohs.push({ name: "", amount: "", period: "month" }); refreshOh(); });
    $("#ohSales", root)?.addEventListener("input", ohReadout);
    wireOh(); ohReadout();
    $("#saveOverheads", root)?.addEventListener("click", () => {
      Store.saveBusiness({
        overheads: ohs.filter((o) => (o.name || "").trim() || o.amount).map((o) => ({ name: (o.name || "Cost").trim(), amount: Number(o.amount) || 0, period: o.period === "year" ? "year" : "month" })),
        monthlySales: Number($("#ohSales", root).value) || 0,
      });
      toast("Running costs saved.", "good");
    });

    // logo upload
    const file = $("#logoFile", root), preview = $("#logoPreview", root), remove = $("#logoRemove", root);
    $("#logoPick", root)?.addEventListener("click", () => file.click());
    file?.addEventListener("change", () => {
      const f = file.files?.[0]; if (!f) return;
      resizeToDataUrl(f, 240, (dataUrl) => {
        if (!dataUrl) return toast("Could not read that image.", "bad");
        Store.saveBusiness({ logo: dataUrl });
        preview.innerHTML = `<img src="${dataUrl}" alt=""/>`;
        remove.hidden = false;
        refreshChrome();
        toast("Logo saved.", "good");
      });
      file.value = "";
    });
    remove?.addEventListener("click", () => {
      Store.saveBusiness({ logo: "" });
      preview.innerHTML = icon("upload", 22);
      remove.hidden = true;
      refreshChrome();
      toast("Logo removed.");
    });

    $("#sSaveInv", root)?.addEventListener("click", () => {
      Store.saveBusiness({ address: $("#sAddress", root).value.trim(), payment: $("#sPayment", root).value.trim() });
      toast("Invoice details saved.", "good");
    });

    wireBilling(root);
  },
};

/* client-side image resize -> small data URL for the logo */
function resizeToDataUrl(file, max, cb) {
  const reader = new FileReader();
  reader.onerror = () => cb(null);
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => cb(null);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      try { cb(c.toDataURL("image/png")); } catch { cb(null); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- billing card (inside Business settings) ---------- */
function billingCard() {
  const sub = Store.subscription();
  const eff = sub.status;
  const left = sub.daysLeft;
  const planName = sub.plan === "weekly" ? "Weekly" : sub.plan === "monthly" ? "Monthly" : "";
  const status = {
    trial:    { label: `Free trial · ${left} ${left === 1 ? "day" : "days"} left`, cls: "sent" },
    active:   { label: `${planName} · renews ${fmtDate(sub.renewsAt)}`, cls: "paid" },
    canceled: { label: `Ending · access until ${fmtDate(sub.renewsAt)}`, cls: "overdue" },
    expired:  { label: "Not subscribed", cls: "draft" },
  }[eff] || { label: "—", cls: "draft" };

  let action = "";
  if (eff === "active") action = `<button class="btn ghost" id="bCancel" style="color:var(--warn)">Cancel subscription</button>`;
  else if (eff === "canceled") action = `<button class="btn primary" id="bResume">Resume subscription</button>`;
  else action = `<button class="btn accent" id="bSubscribe">Choose a plan</button>`;

  return `
    <div class="bill-row"><span class="bk">Plan</span><span class="bv">Trackit · ${naira(SUB_PRICE)}/month</span></div>
    <div class="bill-row"><span class="bk">Status</span><span class="status ${status.cls}"><span class="d"></span>${status.label}</span></div>
    <div class="actions" style="margin-top:16px">
      ${action}
      ${eff !== "expired" ? `<button class="btn ghost sm" id="bPreview" title="Demo">Preview paywall</button>` : ""}
    </div>`;
}
function wireBilling(root) {
  const run = async (fn, ok) => { try { const r = await fn(); Store.setSubscription(r.subscription); if (ok) toast(ok, "good"); go("settings"); } catch (e) { toast(e.message, "bad"); } };
  $("#bSubscribe", root)?.addEventListener("click", () => openSubscribe());
  $("#bCancel", root)?.addEventListener("click", () => run(() => API.billingCancel(), "Subscription canceled. Access continues until your period ends."));
  $("#bResume", root)?.addEventListener("click", () => run(() => API.billingResume(), "Subscription resumed."));
  $("#bPreview", root)?.addEventListener("click", async () => {
    try { const r = await API.billingDevExpire(); Store.setSubscription(r.subscription); toast("Trial ended (demo). This is the paywall."); go("home"); }
    catch (e) { toast(e.message, "bad"); }
  });
}

/* ============================================================
   PAYWALL — shown when the trial or subscription has lapsed
   ============================================================ */
const PLAN_FEATURES = [
  "Live profit on every product and sale",
  "Underpricing alerts with the price to fix it",
  "Unlimited WhatsApp receipts",
  "Professional invoices you can send and print",
  "Your shareable shop link",
];

export const Paywall = {
  html() {
    const sub = Store.subscription();
    const wasSubscribed = !!sub.renewsAt;
    return `
      <div class="paywall">
        <div class="lock">${icon("invoice", 28)}</div>
        <h1>${wasSubscribed ? "Your subscription has ended" : "Your free trial has ended"}</h1>
        <p class="lede">Keep the full picture of your profit, your invoices and your shop.</p>
        <div class="plan">
          <span class="tag">${TRIAL_DAYS} days free, then</span>
          <div class="price"><span class="amt">${naira(SUB_PRICE)}</span><span class="per">/ month</span></div>
          <ul>${PLAN_FEATURES.map((f) => `<li><span class="ck">${icon("check", 13, 3)}</span>${f}</li>`).join("")}</ul>
          <button class="btn accent block" id="subBtn" style="margin-top:20px">Subscribe for ${naira(SUB_PRICE)}/month</button>
        </div>
        <p class="free-hook">Not ready? You can still <a class="link" data-free>price a product for free</a>.</p>
        <p class="fine">Cancel anytime. Your data stays safe while you decide.</p>
      </div>
    `;
  },
  mount(root) {
    $("#subBtn", root)?.addEventListener("click", () => openSubscribe());
    $("[data-free]", root)?.addEventListener("click", () => go("pricing"));
  },
};

/* ---------- subscribe flow (dialog) — routed through the backend ---------- */
export function openSubscribe() {
  const dlg = openDialog(`
    <div class="plan" style="border:0;padding:0">
      <div class="price"><span class="amt">${naira(SUB_PRICE)}</span><span class="per">/ month</span></div>
      <p class="help" style="margin-top:4px">Renews monthly. Cancel anytime from Business settings.</p>
      <ul style="margin-top:16px">${PLAN_FEATURES.map((f) => `<li><span class="ck">${icon("check", 13, 3)}</span>${f}</li>`).join("")}</ul>
    </div>
    <div class="actions" style="margin-top:22px">
      <button class="btn ghost" data-close>Not now</button>
      <button class="btn accent" id="payNow">${icon("check", 18)} Subscribe · ${naira(SUB_PRICE)}/month</button>
    </div>
    <p class="fine" id="subNote" style="text-align:center"></p>
  `, { title: "Subscribe to Trackit" });

  const payBtn = $("#payNow", dlg);
  payBtn.addEventListener("click", async () => {
    payBtn.disabled = true;
    try {
      const init = await API.billingInitialize("monthly");
      if (init.mode === "paystack") { window.location.href = init.authorization_url; return; }
      const r = await API.billingMockActivate("monthly");
      Store.setSubscription(r.subscription);
      closeDialog();
      toast(`You're subscribed. Renews ${fmtDate(r.subscription.renewsAt)}.`, "good");
      go("home");
    } catch (e) { payBtn.disabled = false; $("#subNote", dlg).textContent = e.message; }
  });
}

/* ============================================================
   REPORTS — comprehensive weekly / monthly export
   ============================================================ */
function reportRange(period) {
  const now = new Date();
  if (period === "week") return { from: Date.now() - 7 * 86400000, to: Date.now(), label: "Last 7 days" };
  if (period === "lastmonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;
    return { from: start.getTime(), to: end, label: start.toLocaleDateString("en-NG", { month: "long", year: "numeric" }) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start.getTime(), to: Date.now(), label: now.toLocaleDateString("en-NG", { month: "long", year: "numeric" }) };
}
function reportData(period) {
  const { from, to, label } = reportRange(period);
  const sales = Store.sales().filter((s) => s.at >= from && s.at <= to);
  const byId = {}; let revenue = 0, cost = 0, profit = 0, owing = 0;
  for (const s of sales) {
    const p = Store.product(s.productId); if (!p) continue;
    const rev = (Number(p.price) || 0) * s.qty, cst = unitCost(p) * s.qty;
    revenue += rev; cost += cst; profit += rev - cst; if (!s.paid) owing += rev;
    const e = byId[p.id] || (byId[p.id] = { name: p.name, emoji: p.emoji, units: 0, revenue: 0, cost: 0, profit: 0 });
    e.units += s.qty; e.revenue += rev; e.cost += cst; e.profit += rev - cst;
  }
  const products = Object.values(byId).sort((a, b) => b.profit - a.profit);
  const invs = Store.invoices().filter((i) => i.issuedAt >= from && i.issuedAt <= to);
  const invTot = invs.reduce((s, i) => s + invTotal(i), 0);
  const invPaid = invs.filter((i) => i.status === "paid").reduce((s, i) => s + invTotal(i), 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { label, from, to, count: sales.length, revenue, cost, profit, owing, margin, products,
    invoices: { count: invs.length, total: invTot, paid: invPaid, outstanding: invTot - invPaid } };
}

function reportDocHTML(period) {
  const b = Store.business();
  const r = reportData(period);
  const brand = b.logo ? `<img src="${b.logo}" alt="${esc(b.name)}"/>` : `<div class="biz">${esc(b.name)}</div>`;
  const rows = r.products.length
    ? r.products.map((p) => `<tr>
        <td>${p.emoji || "📦"} ${esc(p.name)}</td>
        <td class="r">${p.units}</td>
        <td class="r">${naira(p.revenue)}</td>
        <td class="r">${naira(p.cost)}</td>
        <td class="r">${naira(p.profit)}</td>
        <td class="r">${p.revenue > 0 ? pct((p.profit / p.revenue) * 100) : "—"}</td></tr>`).join("")
    : `<tr><td colspan="6" style="color:#9aa0af">No sales in this period.</td></tr>`;
  return `<div class="report-doc">
    <div class="rp-head">
      <div><div class="kicker">Business report</div>${brand}<div class="muted">${esc(r.label)}</div></div>
      <div style="text-align:right"><div class="muted">Generated</div><div style="font-weight:800">${fmtDate(Date.now())}</div></div>
    </div>
    <div class="rp-sum">
      <div class="cell"><div class="k">Revenue</div><div class="v">${naira(r.revenue)}</div></div>
      <div class="cell"><div class="k">Cost of goods</div><div class="v">${naira(r.cost)}</div></div>
      <div class="cell"><div class="k">Profit</div><div class="v good">${naira(r.profit)}</div></div>
      <div class="cell"><div class="k">Profit margin</div><div class="v">${pct(r.margin)}</div></div>
      <div class="cell"><div class="k">Sales</div><div class="v">${r.count}</div></div>
      <div class="cell"><div class="k">Owed to you</div><div class="v">${naira(r.owing)}</div></div>
    </div>
    <h4>Profit by product</h4>
    <div class="doc-scroll"><table>
      <thead><tr><th>Product</th><th class="r">Units</th><th class="r">Revenue</th><th class="r">Cost</th><th class="r">Profit</th><th class="r">Margin</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${r.products.reduce((s, p) => s + p.units, 0)}</td><td class="r">${naira(r.revenue)}</td><td class="r">${naira(r.cost)}</td><td class="r">${naira(r.profit)}</td><td class="r">${pct(r.margin)}</td></tr></tfoot>
    </table></div>
    <p class="rp-note">Invoices issued: ${r.invoices.count} · billed ${naira(r.invoices.total)} · paid ${naira(r.invoices.paid)} · outstanding ${naira(r.invoices.outstanding)}.
    Profit is per product, before business running costs like rent and data.</p>
  </div>`;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function reportCSV(period) {
  const b = Store.business();
  const r = reportData(period);
  const rows = [
    [`${b.name} — Business report`],
    [`Period`, r.label],
    [`Generated`, fmtDate(Date.now())],
    [],
    [`Revenue`, r.revenue], [`Cost of goods`, r.cost], [`Profit`, r.profit],
    [`Profit margin %`, Math.round(r.margin)], [`Sales`, r.count], [`Owed to you`, r.owing],
    [],
    [`Product`, `Units`, `Revenue`, `Cost`, `Profit`, `Margin %`],
    ...r.products.map((p) => [p.name, p.units, p.revenue, p.cost, p.profit, p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0]),
    [`Total`, r.products.reduce((s, p) => s + p.units, 0), r.revenue, r.cost, r.profit, Math.round(r.margin)],
  ];
  const slug = r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadCSV(`trackit-report-${slug}.csv`, rows);
}

async function loadInsights(period) {
  const panel = document.getElementById("insightsPanel");
  if (!panel) return;
  const b = Store.business(), r = reportData(period);
  const summary = {
    businessName: b.name, label: r.label, revenue: r.revenue, cost: r.cost, profit: r.profit,
    margin: r.margin, count: r.count, owing: r.owing,
    products: r.products.map((p) => ({ name: p.name, units: p.units, revenue: p.revenue, cost: p.cost, profit: p.profit })),
  };
  let insights = [], ai = false;
  try { const res = await API.reportInsights(summary); insights = res.insights || []; ai = !!res.ai; }
  catch { insights = ["Could not load insights right now. Try again in a moment."]; }
  if (!document.getElementById("insightsPanel")) return; // navigated away
  panel.innerHTML = `<div class="ih"><span class="badge-ai">${icon("spark", 13)} ${ai ? "AI insights" : "Insights"}</span><h3>What this means</h3></div>
    <ul>${insights.map((i) => `<li><span class="dot"></span>${esc(i)}</li>`).join("")}</ul>`;
}

export const Reports = {
  html(params = {}) {
    const period = params.period || "month";
    return `
      ${pageHead({ title: "Reports", intro: "A clear read on where your money went. Export it weekly or monthly.",
        actions: [
          { id: "csv", label: "Download CSV", icon: "download", kind: "ghost" },
          { id: "print", label: "Print / PDF", icon: "print", kind: "primary" },
        ] })}
      <div class="pill-row" style="margin-bottom:18px">
        ${[["week", "This week"], ["month", "This month"], ["lastmonth", "Last month"]].map(([p, l]) =>
          `<button class="pill ${p === period ? "on" : ""}" data-period="${p}">${l}</button>`).join("")}
      </div>
      <div class="insights" id="insightsPanel">
        <div class="ih"><span class="badge-ai">${icon("spark", 13)} Insights</span></div>
        <p class="loading">Reading your numbers…</p>
      </div>
      ${reportDocHTML(period)}
    `;
  },
  mount(root, params = {}) {
    const period = params.period || "month";
    $$("[data-period]", root).forEach((el) => el.addEventListener("click", () => go("reports", { period: el.dataset.period })));
    $("[data-act='print']", root)?.addEventListener("click", () => printDoc(reportDocHTML(period)));
    $("[data-act='csv']", root)?.addEventListener("click", () => { reportCSV(period); toast("Report downloaded.", "good"); });
    loadInsights(period);
  },
};

export const SCREENS = {
  home: Home, products: Products, pricing: Calculator, sales: Sales,
  invoices: Invoices, reports: Reports, shop: Shop, settings: Settings, paywall: Paywall,
};
