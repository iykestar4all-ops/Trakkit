/* ============================================================
   app.js — shell, auth gate, router, boot.
   ============================================================ */

import { $, $$, icon, naira, esc, toast, fileToImage } from "./ui.js";
import { Store, SUB_PRICE, TRIAL_DAYS } from "./store.js";
import { API, AuthError } from "./api.js";

const NAV = [
  { route: "home", label: "Overview", ic: "home" },
  { route: "products", label: "Products", ic: "box" },
  { route: "pricing", label: "Pricing", ic: "calc" },
  { route: "sales", label: "Sales", ic: "chart" },
  { route: "invoices", label: "Invoices", ic: "invoice" },
  { route: "reports", label: "Reports", ic: "report" },
  { route: "shop", label: "Shop", ic: "shop" },
  { sep: true },
  { route: "settings", label: "Business", ic: "settings" },
];
const FREE_WHEN_LOCKED = ["pricing"]; // the calculator stays free — the spread hook

let SCREENS = null, MOD = null;

/* ---------- theme ---------- */
const THEME_KEY = "trackit.theme";
function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "dark" ? "#100f0e" : "#f5f3ef";
  const btn = document.getElementById("themeToggle");
  if (btn) btn.innerHTML = icon(t === "dark" ? "sun" : "moon", 19);
}
function initTheme() {
  let stored = "dark";
  try { stored = localStorage.getItem(THEME_KEY) || "dark"; } catch {}
  applyTheme(stored);
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}
initTheme();

/* ---------- routing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [route, query] = h.split("?");
  const params = {};
  if (query) for (const kv of query.split("&")) { const [k, v] = kv.split("="); params[k] = decodeURIComponent(v || ""); }
  return { route: route || "home", params };
}
export function go(route, params = {}) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const target = `#/${route}${q ? "?" + q : ""}`;
  if (location.hash === target) render();
  else location.hash = target;
  closeDrawer();
}

/* ---------- chrome ---------- */
export function refreshChrome() { renderChrome(); }

function renderChrome() {
  const b = Store.business();
  const src = b.logo || "./assets/icon.svg";
  const markImg = `<img src="${src}" alt="" style="width:100%;height:100%;border-radius:inherit;object-fit:contain"/>`;
  $("#brandMark").innerHTML = markImg;
  $("#brandMarkSm").innerHTML = markImg;
  $("#nav").innerHTML = NAV.map((n) => n.sep ? `<div class="sep"></div>`
    : `<a href="#/${n.route}" data-route="${n.route}">${icon(n.ic, 20)}<span>${n.label}</span></a>`).join("");
  $("#bizChip").innerHTML = `<span class="ava">${(b.owner || b.name || "T")[0].toUpperCase()}</span>
    <span class="bz"><b>${esc(b.name || "My business")}</b><span>${esc(b.owner || "")}</span></span>`;
  $("#bizChip").onclick = () => go("settings");
  $$("#nav a").forEach((a) => a.addEventListener("click", closeDrawer));
}

function setActiveNav(route) {
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

function renderStrip() {
  const strip = $("#statusStrip");
  const sub = Store.subscription();
  if (sub.status === "trial") {
    const left = sub.daysLeft, low = left <= 2;
    strip.className = "status-strip" + (low ? " warn" : "");
    strip.innerHTML = `<span class="si">${icon("spark", 17)}</span>
      <span class="grow"><b>${left} ${left === 1 ? "day" : "days"} left</b> in your free trial. Then ${naira(SUB_PRICE)} a month to keep going.</span>
      <button class="btn ${low ? "accent" : "primary"} sm" data-subscribe>Subscribe</button>`;
    strip.hidden = false;
  } else if (sub.status === "canceled") {
    const left = sub.daysLeft;
    strip.className = "status-strip warn";
    strip.innerHTML = `<span class="si">${icon("cal", 17)}</span>
      <span class="grow">Your plan ends in <b>${left} ${left === 1 ? "day" : "days"}</b>. Resume to keep your shop and invoices.</span>
      <button class="btn primary sm" data-resume>Resume</button>`;
    strip.hidden = false;
  } else {
    strip.hidden = true; strip.innerHTML = "";
  }
  strip.querySelector("[data-subscribe]")?.addEventListener("click", () => MOD.openSubscribe());
  strip.querySelector("[data-resume]")?.addEventListener("click", async () => {
    try { const r = await API.billingResume(); Store.setSubscription(r.subscription); render(); } catch (e) { toast(e.message, "bad"); }
  });
}

function render() {
  const { route, params } = parseHash();
  const locked = Store.subscription().locked;
  const showPaywall = locked && !FREE_WHEN_LOCKED.includes(route);
  const screen = showPaywall ? SCREENS.paywall : (SCREENS[route] || SCREENS.home);
  const root = $("#screen");
  root.innerHTML = screen.html(params);
  screen.mount?.(root, params);
  renderStrip();
  setActiveNav(showPaywall ? "" : route);
  $("#content").scrollTop = 0; window.scrollTo?.(0, 0);
  document.title = `Trackit — ${showPaywall ? "Upgrade" : route[0].toUpperCase() + route.slice(1)}`;
}

/* ---------- drawer ---------- */
function openDrawer() { $("#app").classList.add("drawer-open"); $("#drawerScrim").hidden = false; }
function closeDrawer() { $("#app").classList.remove("drawer-open"); $("#drawerScrim").hidden = true; }

/* ---------- auth gate ---------- */
function showAuth() { $("#app").hidden = true; $("#authView").hidden = false; renderAuth(); }
function showApp() { $("#authView").hidden = true; $("#app").hidden = false; }

export async function logout() {
  try { await API.logout(); } catch {}
  API.setToken(null);
  location.hash = "#/home";
  showAuth();
}

function renderAuth() {
  const view = $("#authView");
  view.innerHTML = `
    <div class="auth">
      <div class="auth-card">
        <div class="auth-brand"><span class="mark"><img src="./assets/icon.svg" alt=""/></span> Trackit</div>
        <p class="auth-tag">Know if you're <em>actually</em> making money.</p>
        <div class="segment" id="authMode">
          <button class="on" data-m="login">Log in</button>
          <button data-m="signup">Create account</button>
        </div>
        <form id="authForm" novalidate>
          <div id="signupFields" hidden>
            <div class="two-col">
              <div class="field"><label>Business name</label><input class="input" id="aBiz" placeholder="e.g. Amara Bakes"/></div>
              <div class="field"><label>Your name</label><input class="input" id="aOwner" placeholder="e.g. Amara"/></div>
            </div>
            <div class="field"><label>Business logo <span class="help" style="display:inline">optional</span></label>
              <div class="logo-row">
                <div class="logo-preview" id="authLogoPrev">${icon("upload", 22)}</div>
                <div>
                  <input type="file" id="authLogoFile" accept="image/png,image/jpeg,image/webp" hidden/>
                  <button type="button" class="btn ghost sm" id="authLogoPick">${icon("upload", 16)} Upload logo</button>
                  <p class="help">Shows in your dashboard and on invoices.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="field"><label>Email</label><input class="input" id="aEmail" type="email" autocomplete="email" placeholder="you@example.com"/></div>
          <div class="field"><label>Password</label>
            <div class="pw-field">
              <input class="input" id="aPass" type="password" autocomplete="current-password" placeholder="At least 6 characters"/>
              <button type="button" class="pw-toggle" id="aPassToggle" aria-label="Show password">${icon("eye", 18)}</button>
            </div>
          </div>
          <p class="auth-err" id="authErr" hidden></p>
          <button class="btn accent block" id="authSubmit" type="submit">Log in</button>
        </form>
        <p class="auth-note" id="authNote">New here? <button class="link" data-switch="signup">Start your 7-day free trial</button></p>
      </div>
    </div>`;

  let mode = "login";
  const setMode = (m) => {
    mode = m;
    $$("#authMode button", view).forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    $("#signupFields", view).hidden = m !== "signup";
    $("#authSubmit", view).textContent = m === "signup" ? "Create account & start trial" : "Log in";
    $("#aPass", view).setAttribute("autocomplete", m === "signup" ? "new-password" : "current-password");
    $("#authNote", view).innerHTML = m === "signup"
      ? `Already have an account? <button class="link" data-switch="login">Log in</button>`
      : `New here? <button class="link" data-switch="signup">Start your 7-day free trial</button>`;
    $("[data-switch]", view)?.addEventListener("click", () => setMode($("[data-switch]", view).dataset.switch));
    $("#authErr", view).hidden = true;
  };
  $$("#authMode button", view).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));
  $("[data-switch]", view).addEventListener("click", (e) => setMode(e.target.dataset.switch));

  let logoData = null;
  const logoFile = $("#authLogoFile", view);
  $("#authLogoPick", view).addEventListener("click", () => logoFile.click());
  logoFile.addEventListener("change", async () => {
    const f = logoFile.files?.[0]; if (!f) return;
    const url = await fileToImage(f, { max: 240, type: "image/png" });
    if (url) { logoData = url; $("#authLogoPrev", view).innerHTML = `<img src="${url}" alt=""/>`; }
    else toast("Could not read that image.", "bad");
    logoFile.value = "";
  });

  const pw = $("#aPass", view), pwToggle = $("#aPassToggle", view);
  pwToggle.addEventListener("click", () => {
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    pwToggle.innerHTML = icon(show ? "eyeOff" : "eye", 18);
    pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    pw.focus();
  });

  $("#authForm", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#authErr", view);
    const email = $("#aEmail", view).value.trim();
    const password = $("#aPass", view).value;
    const btn = $("#authSubmit", view);
    btn.disabled = true;
    try {
      const resp = mode === "signup"
        ? await API.signup({ email, password, businessName: $("#aBiz", view).value.trim(), ownerName: $("#aOwner", view).value.trim(), logo: logoData || "" })
        : await API.login({ email, password });
      await enterApp(resp);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false; btn.disabled = false;
    }
  });
}

/* ---------- boot ---------- */
async function enterApp(authResp) {
  API.setToken(authResp.token);
  Store.hydrate({ business: authResp.business, subscription: authResp.subscription });
  try { const data = await API.getState(); Store.hydrate({ data }); } catch { Store.loadCache(); }
  renderChrome();
  showApp();
  if (!location.hash) location.hash = "#/home";
  render();
}

async function handlePaystackCallback() {
  // Paystack redirects back with ?ref=... — verify it, then clean the URL
  const url = new URL(location.href);
  const ref = url.searchParams.get("ref");
  if (!ref) return false;
  try {
    const r = await API.billingVerify(ref);
    Store.setSubscription(r.subscription);
    toast("Payment confirmed. You're subscribed.", "good");
  } catch (e) { toast(e.message || "Could not confirm payment.", "bad"); }
  url.searchParams.delete("ref");
  history.replaceState(null, "", url.pathname + (url.hash || "#/home"));
  return true;
}

async function boot() {
  MOD = await import("./screens.js");
  SCREENS = MOD.SCREENS;

  $("#hamburger").addEventListener("click", openDrawer);
  $("#drawerScrim").addEventListener("click", closeDrawer);
  window.addEventListener("hashchange", () => { if (!$("#app").hidden) render(); });

  if (API.authed()) {
    try {
      const me = await API.me();
      Store.hydrate({ business: me.business, subscription: me.subscription });
      try { const data = await API.getState(); Store.hydrate({ data }); } catch { Store.loadCache(); }
      renderChrome();
      showApp();
      await handlePaystackCallback();
      if (!location.hash) location.hash = "#/home";
      render();
    } catch (e) {
      if (e instanceof AuthError) showAuth();
      else { renderChrome(); showApp(); Store.loadCache(); render(); } // offline: show cached
    }
  } else {
    showAuth();
  }

  if ("serviceWorker" in navigator) {
    // auto-reload once when a new version takes over, so updates are seamless
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return; refreshing = true; location.reload();
    });
    navigator.serviceWorker.register("./sw.js").then((reg) => reg.update()).catch(() => {});
  }
}

boot();
