/* ============================================================
   db.mjs — tiny JSON-file datastore.
   In-memory object persisted atomically on every write. Adequate
   for a prototype backend; the access API is kept clean so it can
   be swapped for SQLite/Postgres without touching handlers.
   ============================================================ */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const DATA_DIR = process.env.TRACKIT_DATA_DIR || join(import.meta.dirname, "data");
const FILE = join(DATA_DIR, "trackit.json");

const EMPTY = {
  users: {},          // userId -> { id, email, salt, hash, createdAt }
  emailIndex: {},     // email(lowercased) -> userId
  businesses: {},     // userId -> business profile
  states: {},         // userId -> { products, sales, invoices, invoiceSeq }
  subscriptions: {},  // userId -> { status, trialStartedAt, renewsAt, startedAt }
  sessions: {},       // token -> userId
  payments: {},       // reference -> { userId, amount, status, createdAt }
};

let data = load();

function load() {
  try {
    if (existsSync(FILE)) return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch (e) { console.error("db load failed, starting fresh:", e.message); }
  return structuredClone(EMPTY);
}

export function save() {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, FILE); // atomic replace
}

export const db = {
  get data() { return data; },
  save,
  file: FILE,
  reset() { data = structuredClone(EMPTY); save(); },
};
