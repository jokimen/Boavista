"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CaixaDay, CaixaAgg } from "@/lib/api/odata-map";

/** Sub-bloco do detalhe do dia (forma de pagamento ou vendedor). */
function DetailBlock({ title, rows }: { title: string; rows: CaixaAgg[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-text-secondary truncate pr-2">{r.label}</span>
            <span className="tabular-nums whitespace-nowrap">
              <span className="text-text-muted">{r.count}×</span>
              <span className="text-[#10b981] font-medium ml-2">{formatCurrency(r.total)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Recebido por Dia" com linhas EXPANSÍVEIS: clicar num dia abre o detalhe desse
 * dia por forma de pagamento e por vendedor.
 */
export function CaixaByDay({ days }: { days: CaixaDay[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const fmtDay = (s: string) =>
    new Date(s).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

  if (!days.length) return <p className="text-xs text-text-muted">Sem movimentos no período.</p>;

  return (
    <div className="rounded-xl border border-border overflow-y-auto max-h-96">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-sidebar border-b border-border z-10">
          <tr className="text-left text-xs font-semibold text-text-muted uppercase tracking-wide">
            <th className="px-4 py-3 w-8"></th>
            <th className="px-4 py-3">Dia</th>
            <th className="px-4 py-3">Nº Movimentos</th>
            <th className="px-4 py-3">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {days.map((d) => {
            const isOpen = !!open[d.label];
            return (
              <FragmentRow key={d.label} day={d} isOpen={isOpen} onToggle={() => toggle(d.label)} fmtDay={fmtDay} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ day, isOpen, onToggle, fmtDay }: { day: CaixaDay; isOpen: boolean; onToggle: () => void; fmtDay: (s: string) => string }) {
  return (
    <>
      <tr className="bg-bg-card hover:bg-bg-card-hover cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-4 py-3 text-text-muted">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
        <td className="px-4 py-3 text-text-primary capitalize">{fmtDay(day.label)}</td>
        <td className="px-4 py-3 text-text-secondary">{day.count}</td>
        <td className="px-4 py-3 font-medium text-[#10b981]">{formatCurrency(day.total)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-bg-elevated/40">
          <td colSpan={4} className="px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pl-6">
              <DetailBlock title="Por forma de pagamento" rows={day.byMethod} />
              <DetailBlock title="Por vendedor" rows={day.byUser} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
