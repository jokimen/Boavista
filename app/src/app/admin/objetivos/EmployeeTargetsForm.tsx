"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { parseEuroInput } from "@/lib/utils";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Objetivos mensais POR VENDEDOR. A lista de vendedores vem do Visual (Usuario das
 * vendas dos últimos meses). Valores em € de venda líquida; em branco = sem objetivo.
 */
export function EmployeeTargetsForm({
  year,
  month,
  employees,
  targets,
}: {
  year: number;
  month: number;
  employees: string[];
  targets: Record<string, number>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const e of employees) init[e] = targets[e] != null ? String(targets[e]) : "";
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const changePeriod = (y: number, m: number) => router.push(`/admin/objetivos?year=${y}&month=${m}`);

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload: Record<string, number | null> = {};
    for (const e of employees) {
      payload[e] = parseEuroInput(values[e] ?? "");
    }
    try {
      const res = await fetch("/api/admin/employee-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, targets: payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao guardar");
      }
      setMsg({ type: "ok", text: "Objetivos por vendedor guardados." });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Objetivos por vendedor</h3>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => changePeriod(year, Number(e.target.value))}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => changePeriod(Number(e.target.value), month)}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Valores em € de <strong>venda líquida</strong>. Ponto = milhares, vírgula = decimal
        (ex.: <strong>3.000</strong> = 3 000 €). Em branco = sem objetivo (não aparece «% objetivo» na Equipa).
      </p>

      {employees.length === 0 ? (
        <p className="text-sm text-text-muted">Sem vendedores detetados nas vendas recentes.</p>
      ) : (
        <div className="space-y-3">
          {employees.map((e) => (
            <div key={e} className="flex items-center justify-between gap-4">
              <label className="text-sm text-text-strong">{e}</label>
              <div className="relative w-40">
                <input type="text" inputMode="decimal"
                  value={values[e] ?? ""}
                  onChange={(ev) => setValues((v) => ({ ...v, [e]: ev.target.value }))}
                  placeholder="—"
                  className="w-full bg-bg-elevated border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-right text-text-primary focus:border-[#3b82f6] outline-none" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">€</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Save size={15} /> {saving ? "A guardar…" : "Guardar objetivos"}
        </button>
        {msg && <span className={`text-xs ${msg.type === "ok" ? "text-[#10b981]" : "text-[#ef4444]"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
