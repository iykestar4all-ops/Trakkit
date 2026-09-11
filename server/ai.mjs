/* ============================================================
   ai.mjs — report insights.
   Uses Claude when ANTHROPIC_API_KEY is set; otherwise returns a
   solid rule-based analysis so the feature always works.
   ============================================================ */

const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.TRACKIT_AI_MODEL || "claude-haiku-4-5-20251001";

export const aiEnabled = () => !!KEY;

const naira = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
const pct = (n) => `${Math.round(Number(n) || 0)}%`;

/* ---- rule-based analysis (always available) ---- */
export function ruleBasedInsights(s) {
  const out = [];
  const products = (s.products || []).slice();
  if (!s.count) {
    out.push("No sales in this period yet. Log your sales so Trackit can show you where your profit really comes from.");
    return out;
  }
  out.push(`You made ${naira(s.profit)} profit on ${naira(s.revenue)} of sales, a ${pct(s.margin)} margin.`);

  const byProfit = products.filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit);
  if (byProfit[0]) out.push(`${byProfit[0].name} carried the most profit (${naira(byProfit[0].profit)}). Push it harder: feature it in your shop and stock up.`);

  const low = products.filter((p) => p.revenue > 0).map((p) => ({ ...p, m: (p.profit / p.revenue) * 100 })).sort((a, b) => a.m - b.m)[0];
  if (low && low.m < 30) out.push(`${low.name} is thin at ${pct(low.m)} margin. Use Pricing to find a fairer price, or trim its cost.`);

  if (s.owing > 0) out.push(`${naira(s.owing)} is still owed to you. Send a friendly reminder on WhatsApp before it ages.`);

  if (s.margin >= 30) out.push("Your overall margin is healthy. Keep an eye on your running costs like gas, data and transport, which this number does not include yet.");
  else out.push("Your overall margin is below 30%. A small price rise across your top sellers moves this fast.");

  return out.slice(0, 5);
}

/* ---- Claude ---- */
export async function generateInsights(summary) {
  const rule = ruleBasedInsights(summary);
  if (!KEY) return { insights: rule, ai: false };

  const lines = (summary.products || [])
    .map((p) => `- ${p.name}: ${p.units} sold, revenue ${naira(p.revenue)}, cost ${naira(p.cost)}, profit ${naira(p.profit)}`)
    .join("\n");
  const prompt = `You are a sharp, plain-spoken business analyst for a small business owner in Nigeria who sells physical products. All money is in Naira. Analyse this ${summary.label || "period"} report for "${summary.businessName || "the business"}" and give 3 to 5 short, specific, actionable insights. No preamble, no fluff, no em-dashes. Each insight one short sentence. Note that profit here is per product before business running costs like rent and data.

Revenue: ${naira(summary.revenue)}
Cost of goods: ${naira(summary.cost)}
Profit: ${naira(summary.profit)} (${pct(summary.margin)} margin)
Sales count: ${summary.count}
Owed to you (unpaid): ${naira(summary.owing)}
Per product:
${lines || "(no product sales)"}

Return only the insights, one per line, each starting with "- ".`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `AI error ${res.status}`);
    const text = (data.content || []).map((b) => b.text || "").join("\n");
    const insights = text.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    return { insights: insights.length ? insights : rule, ai: insights.length > 0 };
  } catch (e) {
    return { insights: rule, ai: false, error: e.message };
  }
}
