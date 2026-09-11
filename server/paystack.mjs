/* ============================================================
   paystack.mjs — real Paystack calls, gated by a secret key.
   No key configured => enabled() is false and the app falls back
   to a labelled mock activation for local development.
   Docs: https://paystack.com/docs/api/transaction
   ============================================================ */

import { createHmac } from "node:crypto";

const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const BASE = "https://api.paystack.co";

export const enabled = () => !!SECRET;

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new Error(json.message || `Paystack ${path} failed (${res.status})`);
  }
  return json.data;
}

// Start a transaction; returns { authorization_url, access_code, reference }
export function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  return call("/transaction/initialize", {
    method: "POST",
    body: { email, amount: amountKobo, reference, callback_url: callbackUrl, metadata },
  });
}

// Verify a transaction; returns the transaction data (status === "success" on success)
export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// Validate an incoming webhook (x-paystack-signature = HMAC-SHA512 of the raw body)
export function verifyWebhookSignature(rawBody, signature) {
  if (!SECRET || !signature) return false;
  const hash = createHmac("sha512", SECRET).update(rawBody).digest("hex");
  return hash === signature;
}
