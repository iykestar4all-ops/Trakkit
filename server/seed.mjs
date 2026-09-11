/* ============================================================
   seed.mjs — demo catalogue given to a brand-new account so the
   app feels alive. The cake is deliberately underpriced (₦1,200 /
   8%) to show Trackit's core "you are underpricing" moment.
   ============================================================ */

export function seedState() {
  const now = Date.now(), day = 86400000;
  return {
    invoiceSeq: 8,
    products: [
      { id: "p1", name: "Signature chocolate cake", emoji: "🎂", category: "Cakes", price: 15000, stock: 4,
        costs: [{ name: "Ingredients", amount: 8900 }, { name: "Packaging (box + board)", amount: 1900 }, { name: "Gas / baking", amount: 1200 }, { name: "Transport to market", amount: 1800 }] },
      { id: "p2", name: "Small chops tray (50pc)", emoji: "🍢", category: "Snacks", price: 12000, stock: 6,
        costs: [{ name: "Ingredients", amount: 5400 }, { name: "Disposable trays", amount: 900 }, { name: "Gas / frying", amount: 700 }] },
      { id: "p3", name: "Shea body butter (250ml)", emoji: "🧴", category: "Skincare", price: 4500, stock: 20,
        costs: [{ name: "Raw shea + oils", amount: 1700 }, { name: "Jar + label", amount: 650 }] },
      { id: "p4", name: "Ankara tote bag", emoji: "👜", category: "Fashion", price: 6500, stock: 8,
        costs: [{ name: "Fabric", amount: 2200 }, { name: "Lining + zip", amount: 800 }, { name: "Tailor cut", amount: 1500 }] },
    ],
    sales: [
      { id: "s1", productId: "p1", qty: 1, at: now - day * 0.2, paid: true },
      { id: "s2", productId: "p3", qty: 3, at: now - day * 0.6, paid: true },
      { id: "s3", productId: "p2", qty: 1, at: now - day * 1.1, paid: false },
      { id: "s4", productId: "p3", qty: 2, at: now - day * 2.0, paid: true },
      { id: "s5", productId: "p4", qty: 1, at: now - day * 3.0, paid: true },
      { id: "s6", productId: "p1", qty: 1, at: now - day * 5.0, paid: true },
    ],
    invoices: [
      { id: "in1", number: "INV-0007", customer: { name: "Chidinma O.", phone: "2348090001111" },
        items: [{ name: "Signature chocolate cake", qty: 1, price: 15000, cost: 13800 }, { name: "Small chops tray (50pc)", qty: 1, price: 12000, cost: 7000 }],
        discount: 0, issuedAt: now - day * 1, dueAt: now + day * 6, status: "sent", note: "" },
      { id: "in2", number: "INV-0006", customer: { name: "Bola A.", phone: "2348023334455" },
        items: [{ name: "Shea body butter (250ml)", qty: 4, price: 4500, cost: 2350 }],
        discount: 1000, issuedAt: now - day * 8, dueAt: now - day * 1, status: "paid", note: "" },
    ],
  };
}

export function defaultBusiness(name, owner) {
  const slug = (name || "my-shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-shop";
  return { name: name || "My business", owner: owner || "Owner", whatsapp: "", shopSlug: slug, targetMargin: 35, logo: "", address: "", payment: "" };
}
