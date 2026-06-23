/**
 * Montagem (pura, sem I/O) da análise de uma marca a partir do stock atual e do
 * snapshot `brand_history`. Reutilizado pela rota /api/stock/brand.
 */
import type { StockItem } from "@/types";
import type { SplitItem } from "@/components/charts/SplitBars";
import {
  CATEGORY_LABELS,
  genderLabel,
  materialLabel,
  type BenchmarkMetric,
  type BrandAnalysis,
  type BrandHistoryData,
  type RotationRow,
} from "./constants";

const round = (n: number) => Math.round(n * 100) / 100;

/** Universo do benchmark = categorias de armação/sol (as únicas pesquisáveis). */
const ARMACOES_SOL: StockItem["category"][] = ["armacoes", "oculos_sol"];

/** Soma o histórico (vendido/receita/custo) de UMA marca na janela de anos. */
function sumBrandHistory(history: BrandHistoryData, marca: string, years: number[]) {
  let sold = 0, revenue = 0, cost = 0;
  for (const year of years) {
    const y = history.byYear?.[String(year)];
    if (!y) continue;
    sold += y.brandSold?.[marca] ?? 0;
    revenue += y.brandRevenue?.[marca] ?? 0;
    cost += y.brandCost?.[marca] ?? 0;
  }
  return { sold, revenue, cost };
}

interface BrandStat {
  brand: string;
  stockQty: number; stockCost: number; stockSale: number;
  sold: number; revenue: number; cost: number;
}

/**
 * Benchmark da marca vs o universo armações/sol. `avg` = agregado ponderado do
 * universo (= a média global da categoria); `percentile` = posição da marca entre
 * as marcas (0–100, % de marcas com valor ≤ ao desta). Vazio sem histórico.
 */
function buildBenchmark(
  marca: string,
  allItems: StockItem[],
  history: BrandHistoryData | null,
  years: number[],
): BenchmarkMetric[] {
  if (!history) return [];
  const stockByBrand = new Map<string, { qty: number; cost: number; sale: number }>();
  for (const i of allItems) {
    if (!i.brand || !ARMACOES_SOL.includes(i.category)) continue;
    const e = stockByBrand.get(i.brand) ?? { qty: 0, cost: 0, sale: 0 };
    e.qty += i.quantity; e.cost += i.cost * i.quantity; e.sale += i.price * i.quantity;
    stockByBrand.set(i.brand, e);
  }
  const brandSet = new Set<string>(stockByBrand.keys());
  brandSet.add(marca); // a marca-alvo pode já não ter stock mas ter histórico
  const rows: BrandStat[] = [...brandSet].map((b) => {
    const s = stockByBrand.get(b) ?? { qty: 0, cost: 0, sale: 0 };
    const h = sumBrandHistory(history, b, years);
    return { brand: b, stockQty: s.qty, stockCost: s.cost, stockSale: s.sale, sold: h.sold, revenue: h.revenue, cost: h.cost };
  });
  const me = rows.find((r) => r.brand === marca);
  if (!me) return [];

  function metric(
    key: BenchmarkMetric["key"], label: string, unit: BenchmarkMetric["unit"],
    valid: (r: BrandStat) => boolean, valueOf: (r: BrandStat) => number,
    avgOf: (rs: BrandStat[]) => number,
  ): BenchmarkMetric | null {
    if (!valid(me!)) return null;
    const valids = rows.filter(valid);
    if (valids.length < 2) return null; // sem universo para comparar
    const bv = valueOf(me!);
    const le = valids.filter((r) => valueOf(r) <= bv).length;
    return { key, label, unit, brand: round(bv), avg: round(avgOf(valids)), percentile: Math.round((le / valids.length) * 100) };
  }

  const sum = (rs: BrandStat[], f: (r: BrandStat) => number) => rs.reduce((s, r) => s + f(r), 0);

  return [
    metric("stockMargin", "Margem do stock", "%",
      (r) => r.stockSale > 0,
      (r) => ((r.stockSale - r.stockCost) / r.stockSale) * 100,
      (rs) => { const sa = sum(rs, (r) => r.stockSale); return sa > 0 ? ((sa - sum(rs, (r) => r.stockCost)) / sa) * 100 : 0; }),
    metric("salesMargin", "Margem das vendas", "%",
      (r) => r.revenue > 0,
      (r) => ((r.revenue - r.cost) / r.revenue) * 100,
      (rs) => { const rv = sum(rs, (r) => r.revenue); return rv > 0 ? ((rv - sum(rs, (r) => r.cost)) / rv) * 100 : 0; }),
    metric("rotation", "Rotação (vend.4a ÷ stock)", "×",
      (r) => r.stockQty > 0,
      (r) => r.sold / r.stockQty,
      (rs) => { const q = sum(rs, (r) => r.stockQty); return q > 0 ? sum(rs, (r) => r.sold) / q : 0; }),
    metric("ticket", "Ticket médio", "€",
      (r) => r.sold > 0,
      (r) => r.revenue / r.sold,
      (rs) => { const s = sum(rs, (r) => r.sold); return s > 0 ? sum(rs, (r) => r.revenue) / s : 0; }),
  ].filter((m): m is BenchmarkMetric => m !== null);
}

/** Normaliza o código de artigo a 13 dígitos (igual ao norm13 do backend). */
const norm13 = (c: unknown): string => {
  const base = String(c ?? "").replace(/@\d+$/, "").replace(/^0+/, "");
  return base ? base.padStart(13, "0") : "";
};

/**
 * Marcas distintas presentes no stock (ordenadas). Se `categories` for dado,
 * só inclui marcas com ≥1 artigo numa dessas categorias (ex.: armações/sol).
 */
export function brandList(items: StockItem[], categories?: StockItem["category"][]): string[] {
  const allow = categories ? new Set(categories) : null;
  const set = new Set<string>();
  for (const i of items) if (i.brand && (!allow || allow.has(i.category))) set.add(i.brand);
  return [...set].sort((a, b) => a.localeCompare(b, "pt"));
}

function splitFrom(map: Map<string, number>): SplitItem[] {
  const total = [...map.values()].reduce((s, n) => s + n, 0) || 1;
  return [...map.entries()]
    .map(([label, qty]) => ({ label, qty, sales: 0, pct: Math.round((qty / total) * 100) }))
    .sort((a, b) => b.qty - a.qty);
}

export function buildBrandAnalysis(
  marca: string,
  allItems: StockItem[],
  history: BrandHistoryData | null,
  windowYears = 4,
): BrandAnalysis {
  const items = allItems.filter((i) => i.brand === marca);
  const inStock = items.reduce((s, i) => s + i.quantity, 0);
  const stockValueCost = round(items.reduce((s, i) => s + i.cost * i.quantity, 0));
  // Margem do STOCK = (PVP − custo) ÷ PVP, ponderada pela quantidade. Para
  // armações/sol o custo do maestro (Precio_compra) é real → margem fiável.
  const stockValueSale = round(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const marginPct = stockValueSale > 0 ? round(((stockValueSale - stockValueCost) / stockValueSale) * 100) : 0;

  const nowY = new Date().getFullYear();
  const years = Array.from({ length: windowYears }, (_, k) => nowY - (windowYears - 1) + k);

  const soldByYear = years.map((year) => ({ year, qty: history?.byYear?.[String(year)]?.brandSold?.[marca] ?? 0 }));
  const boughtByYear = years.map((year) => ({ year, qty: history?.byYear?.[String(year)]?.brandBought?.[marca] ?? 0 }));
  const sold4y = soldByYear.reduce((s, y) => s + y.qty, 0);
  const bought4y = boughtByYear.reduce((s, y) => s + y.qty, 0);

  // Receita € e margem € por ano (e totais da janela). Custo só fiável p/ armações/sol.
  const revenueByYear = years.map((year) => {
    const y = history?.byYear?.[String(year)];
    const revenue = round(y?.brandRevenue?.[marca] ?? 0);
    const cost = y?.brandCost?.[marca] ?? 0;
    return { year, revenue, margin: round(revenue - cost) };
  });
  const revenue4y = round(revenueByYear.reduce((s, y) => s + y.revenue, 0));
  const marginEur4y = round(revenueByYear.reduce((s, y) => s + y.margin, 0));
  const salesMarginPct = revenue4y > 0 ? round((marginEur4y / revenue4y) * 100) : 0;

  // Vendido por artigo (soma dos anos da janela) — para o rácio de rotação.
  const soldByArticle = new Map<string, number>();
  if (history) {
    for (const year of years) {
      const m = history.byYear?.[String(year)]?.soldByArticle ?? {};
      for (const [c, q] of Object.entries(m)) soldByArticle.set(c, (soldByArticle.get(c) ?? 0) + q);
    }
  }

  // Repartições sobre o STOCK da marca (contagem de peças).
  const classMap = new Map<string, number>();
  const matMap = new Map<string, number>();
  const genMap = new Map<string, number>();
  for (const i of items) {
    const clsLabel = CATEGORY_LABELS[i.category] ?? i.category;
    classMap.set(clsLabel, (classMap.get(clsLabel) ?? 0) + i.quantity);
    const mat = materialLabel(i.material);
    matMap.set(mat, (matMap.get(mat) ?? 0) + i.quantity);
    const gen = genderLabel(i.gender);
    genMap.set(gen, (genMap.get(gen) ?? 0) + i.quantity);
  }

  // Rotação por modelo = vendido(4 anos) ÷ stock atual. Agrega por código.
  const byCode = new Map<string, { model: string; stock: number }>();
  for (const i of items) {
    const e = byCode.get(i.codigo) ?? { model: i.model, stock: 0 };
    e.stock += i.quantity;
    byCode.set(i.codigo, e);
  }
  const ranked: RotationRow[] = [...byCode.entries()]
    .map(([codigo, e]) => {
      const sold = soldByArticle.get(norm13(codigo)) ?? 0;
      return { codigo, model: e.model, stock: e.stock, sold4y: sold, ratio: e.stock > 0 ? round(sold / e.stock) : 0 };
    })
    .filter((r) => r.stock > 0);

  const topRotation = [...ranked].sort((a, b) => b.ratio - a.ratio || b.sold4y - a.sold4y).slice(0, 5);
  const bottomRotation = [...ranked].sort((a, b) => a.ratio - b.ratio || a.sold4y - b.sold4y).slice(0, 5);

  return {
    marca,
    inStock,
    stockValueCost,
    stockValueSale,
    marginPct,
    sold4y,
    bought4y,
    revenue4y,
    marginEur4y,
    salesMarginPct,
    soldByYear,
    boughtByYear,
    revenueByYear,
    byClass: splitFrom(classMap),
    byMaterial: splitFrom(matMap),
    byGender: splitFrom(genMap),
    topRotation,
    bottomRotation,
    benchmark: buildBenchmark(marca, allItems, history, years),
    pendingHistory: !history,
  };
}
