"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatCurrency, formatPercent } from "@/lib/utils";

export interface LowMarginLine {
  desc: string; qty: number; gross: number; discount: number; net: number;
  cost: number | null; margin_pct: number | null;
}
export interface LowMarginRow {
  date: string; product: string; amount: number; margin_pct: number; employee: string;
  gross: number; cost: number; covered_net: number; margin_value: number;
  lines: LowMarginLine[];
}

export function LowMarginTable({ rows }: { rows: LowMarginRow[] }) {
  const [sel, setSel] = useState<LowMarginRow | null>(null);

  return (
    <>
      <p className="text-xs text-text-muted mb-3">Clica numa venda para ver o detalhe das linhas, preços de custo e cálculo de margem.</p>
      <div className="overflow-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#1a0e0e]">
            <tr className="text-left text-xs text-text-secondary border-b border-[#ef4444]/20">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-2">Venda</th>
              <th className="py-2 px-2 text-right">Valor</th><th className="py-2 px-2 text-right">Margem</th><th className="py-2 px-2">Colaborador</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={() => setSel(r)} className="border-b border-[#ef4444]/10 hover:bg-danger-bg/20 cursor-pointer">
                <td className="py-1.5 pr-3 text-text-secondary">{r.date ? new Date(r.date).toLocaleDateString("pt-PT") : "—"}</td>
                <td className="py-1.5 px-2 text-text-strong">{r.product}</td>
                <td className="py-1.5 px-2 text-right">{formatCurrency(r.amount)}</td>
                <td className="py-1.5 px-2 text-right text-[#ef4444] font-semibold">{formatPercent(r.margin_pct)}</td>
                <td className="py-1.5 px-2 text-text-secondary">{r.employee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.product} — detalhe de margem` : ""} size="lg">
        {sel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-text-muted">Venda líquida</p><p className="text-text-primary">{formatCurrency(sel.amount)}</p></div>
              <div><p className="text-xs text-text-muted">Vendas c/ custo conhecido</p><p className="text-text-primary">{formatCurrency(sel.covered_net)}</p></div>
              <div><p className="text-xs text-text-muted">Custo</p><p className="text-text-primary">{formatCurrency(sel.cost)}</p></div>
              <div><p className="text-xs text-text-muted">Margem</p><p className="text-[#ef4444] font-semibold">{formatCurrency(sel.margin_value)} ({formatPercent(sel.margin_pct)})</p></div>
            </div>
            <p className="rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs font-mono text-text-secondary">
              margem % = (vendas c/ custo − custo) ÷ vendas c/ custo × 100 = ({formatCurrency(sel.covered_net)} − {formatCurrency(sel.cost)}) ÷ {formatCurrency(sel.covered_net)} × 100 = {formatPercent(sel.margin_pct)}
            </p>

            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Linhas da venda</h4>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-text-muted border-b border-border">
                    <th className="py-1.5 pr-2">Produto</th><th className="py-1.5 px-2 text-right">Qtd</th>
                    <th className="py-1.5 px-2 text-right">Bruto</th><th className="py-1.5 px-2 text-right">Desc.</th>
                    <th className="py-1.5 px-2 text-right">Líquido</th><th className="py-1.5 px-2 text-right">Custo</th><th className="py-1.5 px-2 text-right">Margem</th>
                  </tr></thead>
                  <tbody>
                    {sel.lines.map((l, k) => (
                      <tr key={k} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 text-text-strong max-w-[18rem] truncate">{l.desc}</td>
                        <td className="py-1.5 px-2 text-right">{l.qty}</td>
                        <td className="py-1.5 px-2 text-right">{formatCurrency(l.gross)}</td>
                        <td className="py-1.5 px-2 text-right text-[#f59e0b]">{l.discount > 0 ? "−" + formatCurrency(l.discount) : "—"}</td>
                        <td className="py-1.5 px-2 text-right">{formatCurrency(l.net)}</td>
                        <td className="py-1.5 px-2 text-right">{l.cost != null ? formatCurrency(l.cost) : <span className="text-text-muted">desconh.</span>}</td>
                        <td className="py-1.5 px-2 text-right">{l.margin_pct != null
                          ? <span className={l.margin_pct < 50 ? "text-[#ef4444]" : "text-[#10b981]"}>{formatPercent(l.margin_pct)}</span>
                          : <span className="text-text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-text-muted mt-2">Linhas com custo &quot;desconh.&quot; (ex.: lentes de laboratório) entram na venda mas não no cálculo da margem.</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
