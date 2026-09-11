/* ============================================================
   billing.mjs — subscription state (server-authoritative).
   Two plans: weekly (₦1,000 / 7 days) and monthly (₦5,000 / 30 days).
   ============================================================ */

export const DAY = 86400000;
export const TRIAL_DAYS = 7;

export const PLANS = {
  monthly: { price: 5000, days: 30, label: "Monthly" },
};
export const SUB_PRICE = PLANS.monthly.price;

export function freshTrial() {
  const now = Date.now();
  return { status: "trial", plan: null, trialStartedAt: now, renewsAt: null, startedAt: now };
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

export function activate(sub, planName = "monthly") {
  const plan = PLANS[planName] || PLANS.monthly;
  const now = Date.now();
  const base = Math.max(now, sub?.renewsAt || 0); // extend if still active
  return { ...sub, status: "active", plan: planName, startedAt: sub?.startedAt || now, renewsAt: base + plan.days * DAY };
}

export function cancel(sub) { return { ...sub, status: "canceled" }; }

export function publicView(sub) {
  const eff = effective(sub);
  return {
    status: eff,
    plan: sub?.plan || null,
    daysLeft: daysLeft(sub),
    renewsAt: sub?.renewsAt || null,
    trialEndsAt: sub?.status === "trial" ? sub.trialStartedAt + TRIAL_DAYS * DAY : null,
    priceNaira: PLANS.monthly.price,
    trialDays: TRIAL_DAYS,
    locked: eff === "expired",
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { price: v.price, days: v.days }])),
  };
}
