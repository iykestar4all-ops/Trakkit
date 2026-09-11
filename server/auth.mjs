/* ============================================================
   auth.mjs — password hashing (scrypt) + opaque session tokens.
   ============================================================ */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const N = 16384, KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, { N }).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const h = scryptSync(password, salt, KEYLEN, { N }).toString("hex");
  const a = Buffer.from(h, "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newToken() {
  return randomBytes(32).toString("hex");
}
