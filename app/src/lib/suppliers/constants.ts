/** Constantes/tipos de fornecedores — SEM dependências de servidor (client-safe). */

export const SUPPLIER_GROUPS = ["oftalmicas", "contacto_saude", "armacoes_sol"] as const;
export type SupplierGroup = (typeof SUPPLIER_GROUPS)[number];

export const SUPPLIER_GROUP_LABELS: Record<SupplierGroup, string> = {
  oftalmicas: "Lentes Oftálmicas",
  contacto_saude: "Lentes de Contacto + Saúde Ocular",
  armacoes_sol: "Armações + Sol",
};

/** Escalão de rappel: a partir de `min` € de compras aplica-se `pct` %. */
export interface RappelTier { min: number; pct: number }

export interface SupplierConfigRow {
  grupo: SupplierGroup | null;
  objetivo_compra: number;
  rappel_pct: number;            // legado: rappel plano (fallback se não houver escalões)
  rappel_tiers: RappelTier[];    // escalões {min €, %}; a % do patamar atingido aplica-se ao TOTAL
}

export type SupplierConfig = Record<string, SupplierConfigRow>;

/** Escalões válidos e ordenados por `min` ascendente. */
export function normalizeTiers(tiers: RappelTier[] | undefined | null): RappelTier[] {
  return (tiers ?? [])
    .map((t) => ({ min: Number(t.min), pct: Number(t.pct) }))
    .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.pct) && t.min >= 0 && t.pct >= 0)
    .sort((a, b) => a.min - b.min);
}

type RappelInput = { rappel_tiers?: RappelTier[] | null; rappel_pct?: number | null };

/** % de rappel efetiva para um total de compras (patamar mais alto atingido). */
export function rappelPctForTotal(total: number, row: RappelInput): number {
  const tiers = normalizeTiers(row.rappel_tiers);
  if (tiers.length) {
    let pct = 0;
    for (const t of tiers) if (total >= t.min) pct = t.pct; // ordenado asc → fica o mais alto atingido
    return pct;
  }
  return row.rappel_pct ?? 0; // fallback legado (rappel plano)
}

/** Rappel € para um total de compras (% do patamar atingido × total). */
export function rappelForTotal(total: number, row: RappelInput): number {
  return total * (rappelPctForTotal(total, row) / 100);
}
