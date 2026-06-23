import { formatCurrency } from "@/lib/utils";

export interface SplitItem { label: string; qty: number; sales: number; pct: number }

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444", "#84cc16"];

/**
 * Distribuição compacta por categoria (barras proporcionais com etiqueta, % e €).
 * Server-friendly (sem Recharts) — ideal para os muitos cortes da página de
 * fornecedor (género, material, tipo de lente, periodicidade de LC, etc.).
 */
export function SplitBars({ items, unit = "qty" }: { items: SplitItem[]; unit?: "qty" | "eur" }) {
  if (!items.length) return <p className="text-xs text-text-muted">Sem dados.</p>;
  const maxPct = Math.max(...items.map((i) => i.pct), 1);
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={it.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-strong font-medium">{it.label}</span>
            <span className="text-text-secondary tabular-nums">
              {unit === "eur" ? formatCurrency(it.sales) : `${it.qty} un.`}
              <span className="text-text-muted ml-1.5">({it.pct}%)</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max((it.pct / maxPct) * 100, 3)}%`, backgroundColor: COLORS[i % COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
