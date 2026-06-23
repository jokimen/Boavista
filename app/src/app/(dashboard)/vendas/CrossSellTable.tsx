"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils";

export interface CrossSellLine { desc: string; qty: number; net: number }
export interface CrossSellRow {
  codigo: string; date: string; client_name: string; client_contact: string;
  value: number; frame: string; lens_type: string; lines: CrossSellLine[];
}

export function CrossSellTable({ rows }: { rows: CrossSellRow[] }) {
  const [sel, setSel] = useState<CrossSellRow | null>(null);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <p className="text-xs text-text-muted mb-3">
        {rows.length} venda(s) de óculos graduados <strong>sem óculos de sol</strong> — candidatas a 2º par / par de sol graduado.
        Potencial associado: {formatCurrency(totalValue)} já faturado nestas vendas. Clica para ver o detalhe.
      </p>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-card">
            <tr className="text-left text-xs text-text-muted border-b border-border">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-2">Cliente</th><th className="py-2 px-2">Contacto</th>
              <th className="py-2 px-2">Armação</th><th className="py-2 px-2">Lente</th><th className="py-2 px-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.codigo} onClick={() => setSel(r)} className="border-b border-border/60 hover:bg-bg-card-hover cursor-pointer">
                <td className="py-1.5 pr-3 text-text-secondary">{r.date ? new Date(r.date).toLocaleDateString("pt-PT") : "—"}</td>
                <td className="py-1.5 px-2 text-text-strong">{r.client_name}</td>
                <td className="py-1.5 px-2">{r.client_contact
                  ? <a href={`tel:${r.client_contact}`} onClick={(e) => e.stopPropagation()} className="text-[#3b82f6] hover:underline">{r.client_contact}</a>
                  : <span className="text-text-muted">—</span>}</td>
                <td className="py-1.5 px-2 text-text-secondary">{r.frame}</td>
                <td className="py-1.5 px-2 text-text-secondary max-w-[14rem] truncate">{r.lens_type}</td>
                <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(r.value)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-text-muted">Sem oportunidades no período.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Venda ${sel.codigo} — ${sel.client_name}` : ""} size="lg">
        {sel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-text-muted">Data</p><p className="text-text-primary">{sel.date ? new Date(sel.date).toLocaleDateString("pt-PT") : "—"}</p></div>
              <div><p className="text-xs text-text-muted">Cliente</p><p className="text-text-primary">{sel.client_name}</p></div>
              <div><p className="text-xs text-text-muted">Contacto</p><p className="text-text-primary">{sel.client_contact || "—"}</p></div>
              <div><p className="text-xs text-text-muted">Total da venda</p><p className="text-[#10b981] font-semibold">{formatCurrency(sel.value)}</p></div>
            </div>
            <div className="rounded-lg bg-border-subtle/20 border border-[#3b82f6]/20 px-3 py-2 text-xs text-[#93c5fd]">
              💡 Oportunidade: este cliente levou óculos graduados mas não levou óculos de sol. Sugerir <strong>par de sol graduado</strong> ou <strong>2º par</strong>.
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Linhas da venda</h4>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-text-muted border-b border-border">
                    <th className="py-1.5 pr-2">Produto</th><th className="py-1.5 px-2 text-right">Qtd</th><th className="py-1.5 px-2 text-right">Valor</th>
                  </tr></thead>
                  <tbody>
                    {sel.lines.map((l, k) => (
                      <tr key={k} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 text-text-strong">{l.desc}</td>
                        <td className="py-1.5 px-2 text-right">{l.qty}</td>
                        <td className="py-1.5 px-2 text-right">{formatCurrency(l.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
