import type { StockItem, StockSummary } from "@/types";

export function mockStock(): { summary: StockSummary; items: StockItem[] } {
  const items: StockItem[] = ([
    { id: "s1", brand: "Ray-Ban", model: "RB3025 Aviator", category: "armacoes", cost: 68, price: 179, margin_pct: 62, quantity: 4, last_sale_date: "2025-09-12", days_without_sale: 260 },
    { id: "s2", brand: "Oakley", model: "OX8046 Crosslink", category: "armacoes", cost: 72, price: 195, margin_pct: 63, quantity: 2, last_sale_date: "2025-11-05", days_without_sale: 206 },
    { id: "s3", brand: "Silhouette", model: "5516 TMA", category: "armacoes", cost: 120, price: 320, margin_pct: 63, quantity: 3, last_sale_date: "2026-01-22", days_without_sale: 128 },
    { id: "s4", brand: "Maui Jim", model: "Peahi", category: "oculos_sol", cost: 85, price: 229, margin_pct: 63, quantity: 5, last_sale_date: "2026-03-10", days_without_sale: 81 },
    { id: "s5", brand: "Essilor", model: "Varilux X", category: "lentes_oftalmicas", cost: 45, price: 110, margin_pct: 59, quantity: 20, last_sale_date: "2026-05-20", days_without_sale: 10 },
    { id: "s6", brand: "Zeiss", model: "Individual 2", category: "lentes_oftalmicas", cost: 62, price: 155, margin_pct: 60, quantity: 15, last_sale_date: "2026-05-25", days_without_sale: 5 },
    { id: "s7", brand: "Acuvue", model: "Oasys 12-pack", category: "lentes_contacto", cost: 18, price: 38, margin_pct: 53, quantity: 30, last_sale_date: "2026-05-28", days_without_sale: 2 },
    { id: "s8", brand: "Alcon", model: "Dailies Total1", category: "lentes_contacto", cost: 22, price: 45, margin_pct: 51, quantity: 25, last_sale_date: "2026-05-26", days_without_sale: 4 },
    { id: "s9", brand: "Lindberg", model: "Air Titanium 5810", category: "armacoes", cost: 180, price: 480, margin_pct: 63, quantity: 1, last_sale_date: "2025-05-15", days_without_sale: 380 },
    { id: "s10", brand: "Porsche Design", model: "P8316 S", category: "armacoes", cost: 210, price: 560, margin_pct: 63, quantity: 2, last_sale_date: "2025-07-20", days_without_sale: 314 },
    { id: "s11", brand: "Prada", model: "PR 08YS", category: "oculos_sol", cost: 95, price: 260, margin_pct: 63, quantity: 3, last_sale_date: "2026-02-14", days_without_sale: 105 },
    { id: "s12", brand: "Gucci", model: "GG0061S", category: "oculos_sol", cost: 88, price: 240, margin_pct: 63, quantity: 2, last_sale_date: "2026-04-01", days_without_sale: 59 },
    { id: "s13", brand: "Tom Ford", model: "FT0248", category: "oculos_sol", cost: 105, price: 285, margin_pct: 63, quantity: 4, last_sale_date: "2025-10-10", days_without_sale: 232 },
    { id: "s14", brand: "Hoya", model: "Sync III", category: "lentes_oftalmicas", cost: 38, price: 95, margin_pct: 60, quantity: 18, last_sale_date: "2026-05-22", days_without_sale: 8 },
    { id: "s15", brand: "CooperVision", model: "Biofinity 6-pack", category: "lentes_contacto", cost: 14, price: 30, margin_pct: 53, quantity: 40, last_sale_date: "2026-05-29", days_without_sale: 1 },
  ] as Omit<StockItem, "last_entry_date" | "days_since_entry" | "codigo">[]).map((i) => ({
    ...i, codigo: i.id, last_entry_date: i.last_sale_date, days_since_entry: i.days_without_sale,
  }));

  const summary: StockSummary = {
    total_items: items.reduce((s, i) => s + i.quantity, 0),
    total_value_cost: items.reduce((s, i) => s + i.cost * i.quantity, 0),
    total_value_sale: items.reduce((s, i) => s + i.price * i.quantity, 0),
    items_90d: items.filter(i => i.days_without_sale > 90).length,
    items_180d: items.filter(i => i.days_without_sale > 180).length,
    items_365d: items.filter(i => i.days_without_sale > 365).length,
    avg_age_days: Math.round(items.reduce((s, i) => s + i.days_without_sale, 0) / items.length),
  };

  return { summary, items };
}
