/* ============================================================
   index.mjs — Trackit backend.
   Serves the static frontend AND the /api/* JSON API from one
   process. Zero third-party dependencies.

   Env:
     PORT                  default 5050
     PAYSTACK_SECRET_KEY   enables real card billing + verification
     TRACKIT_DATA_DIR      where the JSON datastore lives
   ============================================================ */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { randomUUID } from "node:crypto";

import { db, save } from "./db.mjs";
import { hashPassword, verifyPassword, newToken } from "./auth.mjs";
import * as billing from "./billing.mjs";
import * as paystack from "./paystack.mjs";
import { generateInsights } from "./ai.mjs";
import { defaultBusiness } from "./seed.mjs";

const PORT = Number(process.env.PORT || 5050);
const ROOT = join(import.meta.dirname, "..");     // project root holds index.html, js/, css/

/* ---------- helpers ---------- */
const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
};
const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
};
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch {} resolve({ raw, json }); });
    req.on("error", () => resolve({ raw: "", json: {} }));
  });
}
function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
function userFromReq(req) {
  const token = bearer(req);
  if (!token) return null;
  const uid = db.data.sessions[token];
  if (!uid) return null;
  const user = db.data.users[uid];
  return user ? { ...user, id: uid, token } : null;
}
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s || "");
const origin = (req) => `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

function meView(uid) {
  return {
    user: { id: uid, email: db.data.users[uid].email },
    business: db.data.businesses[uid],
    subscription: billing.publicView(db.data.subscriptions[uid]),
  };
}

/* ---------- API ---------- */
async function api(req, res, url) {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const path = url.pathname;
  const { raw, json } = ["POST", "PUT", "DELETE"].includes(req.method) ? await readBody(req) : { raw: "", json: {} };

  // ---- auth ----
  if (path === "/api/auth/signup" && req.method === "POST") {
    const email = String(json.email || "").trim().toLowerCase();
    const password = String(json.password || "");
    if (!isEmail(email)) return send(res, 400, { error: "Enter a valid email." });
    if (password.length < 6) return send(res, 400, { error: "Password must be at least 6 characters." });
    if (db.data.emailIndex[email]) return send(res, 409, { error: "An account with this email already exists." });

    if (typeof json.logo === "string" && json.logo.length > 700000)
      return send(res, 413, { error: "Logo image is too large. Use a smaller file." });
    const uid = randomUUID();
    const { salt, hash } = hashPassword(password);
    db.data.users[uid] = { email, salt, hash, createdAt: Date.now() };
    db.data.emailIndex[email] = uid;
    const biz = defaultBusiness(json.businessName, json.ownerName);
    if (typeof json.logo === "string" && json.logo) biz.logo = json.logo;
    db.data.businesses[uid] = biz;
    db.data.states[uid] = { products: [], sales: [], invoices: [], invoiceSeq: 1 }; // start empty; real business, real data
    db.data.subscriptions[uid] = billing.freshTrial();
    const token = newToken();
    db.data.sessions[token] = uid;
    save();
    return send(res, 201, { token, ...meView(uid) });
  }

  if (path === "/api/auth/login" && req.method === "POST") {
    const email = String(json.email || "").trim().toLowerCase();
    const uid = db.data.emailIndex[email];
    const user = uid && db.data.users[uid];
    if (!user || !verifyPassword(String(json.password || ""), user.salt, user.hash))
      return send(res, 401, { error: "Wrong email or password." });
    const token = newToken();
    db.data.sessions[token] = uid;
    save();
    return send(res, 200, { token, ...meView(uid) });
  }

  // everything below needs a session
  const me = userFromReq(req);

  if (path === "/api/auth/logout" && req.method === "POST") {
    if (me) { delete db.data.sessions[me.token]; save(); }
    return send(res, 200, { ok: true });
  }

  if (!me) return send(res, 401, { error: "Please sign in." });
  const uid = me.id;

  if (path === "/api/me" && req.method === "GET") return send(res, 200, meView(uid));

  if (path === "/api/business" && req.method === "PUT") {
    if (typeof json.logo === "string" && json.logo.length > 700000)
      return send(res, 413, { error: "Logo image is too large. Use a smaller file." });
    const b = db.data.businesses[uid];
    const patch = {};
    for (const k of ["name", "owner", "whatsapp", "shopSlug", "targetMargin", "logo", "address", "payment", "ingredients"])
      if (k in json) patch[k] = json[k];
    db.data.businesses[uid] = { ...b, ...patch };
    save();
    return send(res, 200, { business: db.data.businesses[uid] });
  }

  if (path === "/api/state" && req.method === "GET")
    return send(res, 200, db.data.states[uid] || { products: [], sales: [], invoices: [], invoiceSeq: 1 });

  if (path === "/api/state" && req.method === "PUT") {
    const s = db.data.states[uid] || {};
    db.data.states[uid] = {
      products: Array.isArray(json.products) ? json.products : s.products || [],
      sales: Array.isArray(json.sales) ? json.sales : s.sales || [],
      invoices: Array.isArray(json.invoices) ? json.invoices : s.invoices || [],
      invoiceSeq: Number(json.invoiceSeq) || s.invoiceSeq || 1,
    };
    save();
    return send(res, 200, { ok: true });
  }

  // ---- billing ----
  const planOf = (j) => (billing.PLANS[j.plan] ? j.plan : "monthly");

  if (path === "/api/billing/initialize" && req.method === "POST") {
    const plan = planOf(json);
    if (!paystack.enabled()) return send(res, 200, { mode: "mock", plan });
    const reference = `TRK-${uid.slice(0, 8)}-${Date.now()}`;
    try {
      const data = await paystack.initializeTransaction({
        email: me.email,
        amountKobo: billing.PLANS[plan].price * 100,
        reference,
        callbackUrl: `${origin(req)}/?ref=${reference}#/billing/callback`,
        metadata: { userId: uid, plan },
      });
      db.data.payments[reference] = { userId: uid, plan, amount: billing.PLANS[plan].price, status: "pending", createdAt: Date.now() };
      save();
      return send(res, 200, { mode: "paystack", authorization_url: data.authorization_url, reference });
    } catch (e) { return send(res, 502, { error: e.message }); }
  }

  if (path === "/api/billing/verify" && req.method === "POST") {
    if (!paystack.enabled()) return send(res, 400, { error: "Card billing is not configured." });
    const reference = String(json.reference || "");
    try {
      const tx = await paystack.verifyTransaction(reference);
      if (tx.status !== "success") return send(res, 402, { error: "Payment not completed." });
      const plan = db.data.payments[reference]?.plan || "monthly";
      db.data.subscriptions[uid] = billing.activate(db.data.subscriptions[uid], plan);
      if (db.data.payments[reference]) db.data.payments[reference].status = "success";
      save();
      return send(res, 200, { subscription: billing.publicView(db.data.subscriptions[uid]) });
    } catch (e) { return send(res, 502, { error: e.message }); }
  }

  if (path === "/api/billing/mock-activate" && req.method === "POST") {
    if (paystack.enabled()) return send(res, 400, { error: "Use the card checkout." });
    db.data.subscriptions[uid] = billing.activate(db.data.subscriptions[uid], planOf(json));
    save();
    return send(res, 200, { subscription: billing.publicView(db.data.subscriptions[uid]), mock: true });
  }

  if (path === "/api/billing/cancel" && req.method === "POST") {
    db.data.subscriptions[uid] = billing.cancel(db.data.subscriptions[uid]);
    save();
    return send(res, 200, { subscription: billing.publicView(db.data.subscriptions[uid]) });
  }

  if (path === "/api/billing/resume" && req.method === "POST") {
    const sub = db.data.subscriptions[uid];
    db.data.subscriptions[uid] = (sub.renewsAt && sub.renewsAt > Date.now())
      ? { ...sub, status: "active" } : billing.activate(sub, sub.plan || "monthly");
    save();
    return send(res, 200, { subscription: billing.publicView(db.data.subscriptions[uid]) });
  }

  if (path === "/api/billing/dev-expire" && req.method === "POST") {
    const sub = db.data.subscriptions[uid];
    db.data.subscriptions[uid] = { ...sub, status: "trial", trialStartedAt: Date.now() - (billing.TRIAL_DAYS * billing.DAY + 1000) };
    save();
    return send(res, 200, { subscription: billing.publicView(db.data.subscriptions[uid]) });
  }

  // ---- AI insights for a report ----
  if (path === "/api/reports/insights" && req.method === "POST") {
    try {
      const result = await generateInsights(json.summary || json || {});
      return send(res, 200, result);
    } catch (e) { return send(res, 200, { insights: [], ai: false, error: e.message }); }
  }

  return send(res, 404, { error: "Unknown endpoint." });
}

/* webhook needs the raw body + no auth; handled before the api() auth wall */
async function webhook(req, res) {
  const { raw, json } = await readBody(req);
  const sig = req.headers["x-paystack-signature"];
  if (!paystack.verifyWebhookSignature(raw, sig)) { res.writeHead(401); return res.end(); }
  if (json.event === "charge.success") {
    const uid = json.data?.metadata?.userId || db.data.payments[json.data?.reference]?.userId;
    if (uid && db.data.subscriptions[uid]) {
      const plan = json.data?.metadata?.plan || db.data.payments[json.data?.reference]?.plan || "monthly";
      db.data.subscriptions[uid] = billing.activate(db.data.subscriptions[uid], plan);
      if (db.data.payments[json.data.reference]) db.data.payments[json.data.reference].status = "success";
      save();
    }
  }
  res.writeHead(200); res.end();
}

/* ---------- static ---------- */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
};
async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const full = normalize(join(ROOT, p));
  if (!full.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end("no"); }
  try {
    const s = await stat(full);
    const file = s.isDirectory() ? join(full, "index.html") : full;
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

/* ---------- server ---------- */
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/paystack/webhook" && req.method === "POST") return webhook(req, res);
    if (url.pathname.startsWith("/api/")) return api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error("request error:", e);
    if (!res.headersSent) send(res, 500, { error: "Server error." });
  }
}).listen(PORT, () => {
  console.log(`Trackit backend on http://localhost:${PORT}`);
  console.log(`Paystack: ${paystack.enabled() ? "LIVE (secret key set)" : "mock mode (no PAYSTACK_SECRET_KEY)"}`);
  console.log(`Data: ${db.file}`);
});
