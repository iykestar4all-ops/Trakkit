/* ============================================================
   db.mjs — datastore.
   Two backends, chosen by env:
     • Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
       are set — persists across restarts/redeploys (free tier).
     • Local JSON file otherwise (development).
   The whole dataset is held in memory; reads are synchronous. Writes
   are flushed to the backend (debounced).

   Supabase setup (run once in the SQL editor):
     create table if not exists kv (k text primary key, v jsonb);
     alter table kv enable row level security;   -- service role bypasses RLS
   ============================================================ */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const DATA_DIR = process.env.TRACKIT_DATA_DIR || join(import.meta.dirname, "data");
const FILE = join(DATA_DIR, "trackit.json");

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const useSupabase = !!(SB_URL && SB_KEY);

const EMPTY = {
  users: {}, emailIndex: {}, businesses: {}, states: {},
  subscriptions: {}, sessions: {}, payments: {},
};

/* ---------- Supabase REST helpers ---------- */
const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...extra,
});
async function sbLoad() {
  const res = await fetch(`${SB_URL}/rest/v1/kv?select=k,v`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase load ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  const d = structuredClone(EMPTY);
  for (const { k, v } of rows) {
    if (k === "core") Object.assign(d, v);
    else if (k.startsWith("business:")) d.businesses[k.slice(9)] = v;
    else if (k.startsWith("state:")) d.states[k.slice(6)] = v;
  }
  return d;
}
async function sbFlush(d) {
  const rows = [{
    k: "core",
    v: { users: d.users, emailIndex: d.emailIndex, sessions: d.sessions, subscriptions: d.subscriptions, payments: d.payments },
  }];
  for (const uid of Object.keys(d.businesses)) rows.push({ k: `business:${uid}`, v: d.businesses[uid] });
  for (const uid of Object.keys(d.states)) rows.push({ k: `state:${uid}`, v: d.states[uid] });
  const res = await fetch(`${SB_URL}/rest/v1/kv`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase flush ${res.status}: ${await res.text()}`);
}

/* ---------- file backend ---------- */
function fileLoad() {
  try { if (existsSync(FILE)) return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(FILE, "utf8")) }; }
  catch (e) { console.error("db file load failed:", e.message); }
  return structuredClone(EMPTY);
}
function fileFlush(d) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(d, null, 2));
  renameSync(tmp, FILE);
}

/* ---------- init (top-level await) ---------- */
let data;
if (useSupabase) {
  try { data = await sbLoad(); console.log("Storage: Supabase (persistent)"); }
  catch (e) { console.error("Supabase load failed, starting empty:", e.message); data = structuredClone(EMPTY); }
} else {
  data = fileLoad();
  console.log("Storage: local JSON file (development)");
}

/* ---------- debounced flush ---------- */
let timer = null, flushing = false, dirty = false;
async function doFlush() {
  if (flushing) { dirty = true; return; }
  flushing = true; dirty = false;
  try { if (useSupabase) await sbFlush(data); else fileFlush(data); }
  catch (e) { console.error("db flush failed:", e.message); dirty = true; }
  flushing = false;
  if (dirty) doFlush();
}
export function save() {
  clearTimeout(timer);
  timer = setTimeout(doFlush, 150);
}
async function flushNow() { clearTimeout(timer); await doFlush(); }

// best-effort final flush on shutdown (Render sends SIGTERM on deploy)
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => { try { await flushNow(); } finally { process.exit(0); } });

export const db = {
  get data() { return data; },
  save,
  file: useSupabase ? "supabase" : FILE,
  async reset() { data = structuredClone(EMPTY); await flushNow(); },
};
