"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export interface EmployeeRow {
  employee_id: string;
  name: string;
  sales_month: number;
  margin_pct: number;
  avg_ticket: number;
  discount_avg: number;
  quotes_issued: number;
  quotes_converted: number;
  target: number;
}

/** Tabela de colaboradores com drill-down: clicar numa linha abre o detalhe. */
export function EmployeeDrilldown({ employees }: { employees: EmployeeRow[] }) {
  const [selected, setSelected] = useState<EmployeeRow | null>(null);

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-sidebar border-b border-border">
            <tr className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Colaborador</th>
              <th className="px-4 py-3 text-left">Vendas</th>
              <th className="px-4 py-3 text-left">Margem %</th>
              <th className="px-4 py-3 text-left">Ticket Médio</th>
              <th className="px-4 py-3 text-left">Tx. Conv.</th>
              <th className="px-4 py-3 text-right">Detalhe</th>
            </tr>
          </thead>
          <tbody className="bg-bg-card divide-y divide-border">
            {employees.map((e) => {
              const conv = e.quotes_issued > 0 ? (e.quotes_converted / e.quotes_issued) * 100 : 0;
              return (
                <tr
                  key={e.employee_id}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer transition-colors hover:bg-bg-card-hover"
                >
                  <td className="px-4 py-3 text-text-primary font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-text-primary">{formatCurrency(e.sales_month)}</td>
                  <td className="px-4 py-3 text-[#10b981]">{formatPercent(e.margin_pct)}</td>
                  <td className="px-4 py-3 text-text-primary">{formatCurrency(e.avg_ticket)}</td>
                  <td className="px-4 py-3 text-[#3b82f6]">{formatPercent(conv, 0)}</td>
                  <td className="px-4 py-3 text-right text-text-muted">
                    <ChevronRight size={16} className="inline" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Detalhe — ${selected.name}` : ""} size="lg">
        {selected && <EmployeeDetail e={selected} />}
      </Modal>
    </>
  );
}

function EmployeeDetail({ e }: { e: EmployeeRow }) {
  const conv = e.quotes_issued > 0 ? (e.quotes_converted / e.quotes_issued) * 100 : 0;
  const targetPct = e.target > 0 ? (e.sales_month / e.target) * 100 : 0;
  const missing = Math.max(e.target - e.sales_month, 0);

  const metrics: { label: string; value: string; accent?: string }[] = [
    { label: "Vendas do mês", value: formatCurrency(e.sales_month) },
    { label: "Objetivo", value: formatCurrency(e.target) },
    { label: "Cumprimento", value: formatPercent(targetPct, 0), accent: targetPct >= 100 ? "text-[#10b981]" : "text-[#f59e0b]" },
    { label: "Falta p/ objetivo", value: formatCurrency(missing) },
    { label: "Margem", value: formatPercent(e.margin_pct), accent: "text-[#10b981]" },
    { label: "Ticket médio", value: formatCurrency(e.avg_ticket) },
    { label: "Desconto médio", value: formatPercent(e.discount_avg), accent: e.discount_avg > 8 ? "text-[#ef4444]" : undefined },
    { label: "Orçamentos emitidos", value: String(e.quotes_issued) },
    { label: "Orçamentos convertidos", value: String(e.quotes_converted) },
    { label: "Taxa de conversão", value: formatPercent(conv, 0), accent: "text-[#3b82f6]" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center">
          <span className="text-white font-bold">{e.name[0]}</span>
        </div>
        <div>
          <p className="text-base font-semibold text-text-primary">{e.name}</p>
          <Badge variant={targetPct >= 100 ? "success" : targetPct >= 75 ? "warning" : "danger"}>
            {formatPercent(targetPct, 0)} do objetivo
          </Badge>
        </div>
      </div>

      {/* Barra de progresso do objetivo */}
      <div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${Math.min(targetPct, 100)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg bg-border/50 border border-border p-3">
            <p className="text-xs text-text-muted">{m.label}</p>
            <p className={`text-lg font-bold ${m.accent ?? "text-text-primary"}`}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
