"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { TARGET_CATEGORIES, TARGET_LABELS, type MonthlyTargets, type TargetCategory } from "@/lib/targets/constants";
import { parseEuroInput } from "@/lib/utils";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function TargetsForm({
  year,
  month,
  targets,
}: {
  year: number;
  month: number;
  targets: MonthlyTargets;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<TargetCategory, string>>(() => {
    const init = {} as Record<TargetCategory, string>;
    for (const c of TARGET_CATEGORIES) init[c] = targets[c] != null ? String(targets[c]) : "";
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Anos disponíveis para escolher (ano atual ± 1).
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];

  function changePeriod(nextYear: number, nextMonth: number) {
    router.push(`/admin/objetivos?year=${nextYear}&month=${nextMonth}`);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload: Record<string, number | null> = {};
    for (const c of TARGET_CATEGORIES) {
      payload[c] = parseEuroInput(values[c]);
    }
    try {
      const res = await fetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, targets: payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao guardar");
      }
      setMsg({ type: "ok", text: "Objetivos guardados." });
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
        <h3 className="text-sm font-semibold text-text-primary">Objetivos do mês</h3>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => changePeriod(year, Number(e.target.value))}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => changePeriod(Number(e.target.value), month)}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Valores em € de <strong>venda líquida</strong>. Ponto = milhares, vírgula = decimal
        (ex.: <strong>24.500</strong> = 24 500 €). Deixa em branco para não definir objetivo
        (a barra desse item não aparece no dashboard).
      </p>

      <div className="space-y-3">
        {TARGET_CATEGORIES.map((c) => (
          <div key={c} className="flex items-center justify-between gap-4">
            <label className="text-sm text-text-strong">
              {TARGET_LABELS[c]}
              {c === "global" && <span className="text-text-muted"> (total do mês)</span>}
            </label>
            <div className="relative w-40">
              <input
                type="text"
                inputMode="decimal"
                value={values[c]}
                onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
                placeholder="—"
                className="w-full bg-bg-elevated border border-border rounded-lg pl-3 pr-7 py-1.5 text-sm text-right text-text-primary focus:border-[#3b82f6] outline-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">€</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Save size={15} /> {saving ? "A guardar…" : "Guardar objetivos"}
        </button>
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
