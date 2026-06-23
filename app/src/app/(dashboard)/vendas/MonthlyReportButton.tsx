"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

const iso = (d: Date) => d.toISOString();
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function MonthlyReportButton() {
  // por defeito, o mês anterior
  const prev = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d; })();
  const [year, setYear] = useState<number>(prev.getFullYear());
  const [month, setMonth] = useState<number>(prev.getMonth() + 1); // 1-12
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  async function gen() {
    setErr(null); setBusy(true);
    try {
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 1); // 1º do mês seguinte (exclusivo)
      const res = await fetch(`/api/reports/monthly?from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erro ${res.status}`);
      const data = await res.json();
      const { buildMonthlyPdf } = await import("@/lib/reports/monthly-pdf");
      const tag = `${year}-${String(month).padStart(2, "0")}`;
      buildMonthlyPdf(data).save(`Relatorio Mensal ${tag}.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar");
    } finally { setBusy(false); }
  }

  const sel = "bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:border-[#3b82f6] outline-none";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-text-muted">Mês</label>
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={sel}>
        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <label className="text-xs text-text-muted">Ano</label>
      <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={sel}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={gen} disabled={busy}
        className="flex items-center gap-2 bg-[#fc4c3b] hover:bg-[#e23d2d] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
        <FileDown size={15} /> {busy ? "A gerar…" : "Relatório mensal (PDF)"}
      </button>
      {err && <span className="text-xs text-[#ef4444]">{err}</span>}
    </div>
  );
}
