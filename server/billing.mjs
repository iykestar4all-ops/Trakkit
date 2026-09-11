/* ============================================================
   billing.mjs — subscription state (server-authoritative).
   ============================================================ */

export const DAY = 86400000;
export const TRIAL_DAYS = 7;
export const SUB_PRICE = 5000;       // ₦ per month
export const SUB_PRICE_KOBO = SUB_PRICE * 100;
export const PERIOD_DAYS = 30;

export function freshTrial() {
  const now = Date.now();
  return { status: "trial", trialStartedAt: now, renewsAt: null, startedAt: now };
}

export function effective(sub) {
  const now = Date.now();
  if (!sub) return "trial";
  if (sub.status === "trial") return now > sub.trialStartedAt + TRIAL_DAYS * DAY ? "expired" : "trial";
  if (sub.status === "active") return sub.renewsAt && sub.renewsAt < now ? "expired" : "active";
  if (sub.status === "canceled") return sub.renewsAt && sub.renewsAt > now ? "canceled" : "expired";
  return sub.status;
}

export function daysLeft(sub) {
  const now = Date.now(), eff = effective(sub);
  if (eff === "trial") return Math.max(0, Math.ceil((sub.trialStartedAt + TRIAL_DAYS * DAY - now) / DAY));
  if (eff === "active" || eff === "canceled") return Math.max(0, Math.ceil((sub.renewsAt - now) / DAY));
  return 0;
}

export function activate(sub, months = 1) {
  const now = Date.now();
  const base = Math.max(now, sub?.renewsAt || 0); // extend if still active
  return { ...sub, status: "active", startedAt: sub?.startedAt || now, renewsAt: base + months * PERIOD_DAYS * DAY };
}

export function cancel(sub) {
  return { ...sub, status: "canceled" };
}

/* what the client needs to render the strip / paywall / billing card */
export function publicView(sub) {
  const eff = effective(sub);
  return {
    status: eff,
    daysLeft: daysLeft(sub),
    renewsAt: sub?.renewsAt || null,
    trialEndsAt: sub?.status === "trial" ? sub.trialStartedAt + TRIAL_DAYS * DAY : null,
    priceNaira: SUB_PRICE,
    trialDays: TRIAL_DAYS,
    locked: eff === "expired",
  };
}
