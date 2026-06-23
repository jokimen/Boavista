"use client";

import { useState } from "react";
import { CategoryBarChart } from "./CategoryBarChart";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatPercent } from "@/lib/utils";

export interface CategoryRow {
  category: string;
  label: string;
  sales: number;
  margin_pct: number;
  quantity: number;
  avg_ticket: number;
}

/** Gráfico de categorias com drill-down: clicar numa barra abre o detalhe. */
export function CategoryDrilldown({ data }: { data: CategoryRow[] }) {
  const [sel, setSel] = useState<CategoryRow | null>(null);

  return (
    <>
      <CategoryBarChart
        data={data}
        onBarClick={(cat) => setSel(data.find((d) => d.category === cat) ?? null)}
      />
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Categoria — ${sel.label}` : ""}>
        {sel && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Vendas", value: formatCurrency(sel.sales) },
              { label: "Margem", value: formatPercent(sel.margin_pct), accent: "text-[#10b981]" },
              { label: "Quantidade", value: String(sel.quantity) },
              { label: "Ticket médio", value: formatCurrency(sel.avg_ticket) },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-border/50 border border-border p-3">
                <p className="text-xs text-text-muted">{m.label}</p>
                <p className={`text-lg font-bold ${m.accent ?? "text-text-primary"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
