/**
 * Constantes e tipos CLIENT-SAFE da página de Stock (sem `next/headers`/`server-only`).
 * Partilhados entre o cálculo da análise por marca (server), a rota /api/stock/brand
 * e os componentes cliente (StockOverview, BrandAnalysis).
 */
import type { SplitItem } from "@/components/charts/SplitBars";
import type { SaleCategory } from "@/types";

export const CATEGORY_LABELS: Record<string, string> = {
  lentes_oftalmicas: "Lentes Oft.",
  armacoes: "Armações",
  oculos_sol: "Óculos Sol",
  lentes_contacto: "L. Contacto",
  saude_ocular: "Saúde Ocular",
  diversos: "Diversos",
};

/**
 * Normaliza o género (de `Familia_agrupacion3` do maestro) para 4 baldes.
 * Os valores reais do Visual variam (ES/PT) — heurística por inclusão, sem
 * acentos e em maiúsculas. Desconhecido → "—".
 */
export function genderLabel(raw?: string | null): string {
  const s = (raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (!s) return "—";
  if (/UNISEX/.test(s)) return "Unisexo";
  if (/(NIN|INFANT|JUNIOR|KID|CRIANC|CHILD|BEBE)/.test(s)) return "Criança";
  // PT real do maestro: SENHORA (feminino) / HOMEM (masculino). "SENHORA" não
  // contém "SENO" → tem de ser apanhado à parte (caía em "—" antes). HOMEM antes
  // de MAN/MEN para evitar falsos positivos.
  if (/(SENHORA|MUJER|SENO|SEÑO|DAMA|FEM|WOMAN|WOMEN|LADY|MULHER)/.test(s)) return "Feminino";
  if (/(HOMEM|HOMBR|CABALL|MASC|MEN|MAN)/.test(s)) return "Masculino";
  return "—";
}

/** Material (de `Familia_agrupacion2`): devolve o valor limpo (Título). Vazio → "—". */
export function materialLabel(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Tipos do histórico por marca (snapshot brand_history) ────────────────────

export interface BrandHistoryYear {
  /** marca → unidades vendidas nesse ano. */
  brandSold: Record<string, number>;
  /** marca → unidades compradas (rececionadas) nesse ano. */
  brandBought: Record<string, number>;
  /** marca → receita € vendida nesse ano (líquida). Ausente em snapshots antigos. */
  brandRevenue?: Record<string, number>;
  /** marca → custo € do vendido nesse ano (fiável p/ armações/sol). Ausente em snapshots antigos. */
  brandCost?: Record<string, number>;
  /** código de artigo (13 díg) → unidades vendidas nesse ano (para rotação por modelo). */
  soldByArticle: Record<string, number>;
}

export interface BrandHistoryData {
  generatedAt: string;
  /** Por ano (chave = ano em string no JSON). */
  byYear: Record<string, BrandHistoryYear>;
}

// ─── Resultado da análise de uma marca (payload pequeno para o cliente) ───────

export interface RotationRow {
  codigo: string;
  model: string;
  stock: number;
  sold4y: number;
  /** vendido(4 anos) ÷ stock atual. */
  ratio: number;
}

/** Uma métrica de benchmark da marca face à média do universo (armações/sol). */
export interface BenchmarkMetric {
  key: "stockMargin" | "salesMargin" | "rotation" | "ticket";
  label: string;
  unit: "%" | "×" | "€";
  /** valor da marca. */
  brand: number;
  /** média (ponderada) do universo de marcas armações/sol. */
  avg: number;
  /** percentil da marca no universo (0–100): % de marcas com valor ≤ ao desta. */
  percentile: number;
}

export interface BrandAnalysis {
  marca: string;
  inStock: number;
  stockValueCost: number;
  /** Valor do stock a PVP (Σ preço×qtd). */
  stockValueSale: number;
  /** Margem do stock ponderada: (PVP − custo) ÷ PVP, em %. */
  marginPct: number;
  sold4y: number;
  bought4y: number;
  /** Receita € vendida na janela (4 anos). */
  revenue4y: number;
  /** Margem € gerada pelas vendas na janela (receita − custo). */
  marginEur4y: number;
  /** Margem % das VENDAS na janela (margem € ÷ receita). */
  salesMarginPct: number;
  soldByYear: { year: number; qty: number }[];
  boughtByYear: { year: number; qty: number }[];
  /** Receita € e margem € por ano (alinhado com soldByYear). */
  revenueByYear: { year: number; revenue: number; margin: number }[];
  byClass: SplitItem[];
  byMaterial: SplitItem[];
  byGender: SplitItem[];
  topRotation: RotationRow[];
  bottomRotation: RotationRow[];
  /** Comparação com a média do universo armações/sol. Vazio se sem histórico. */
  benchmark: BenchmarkMetric[];
  /** true quando o snapshot brand_history ainda não existe (pré-cálculo pendente). */
  pendingHistory: boolean;
}

export type { SaleCategory };
