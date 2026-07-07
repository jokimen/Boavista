"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { DashboardFilters } from "@/lib/filters/range";

const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mês" },
  { value: "last_month", label: "Mês anterior" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Todas as categorias" },
  { value: "lentes_oftalmicas", label: "Lentes Oftálmicas" },
  { value: "armacoes", label: "Armações" },
  { value: "oculos_sol", label: "Óculos de Sol" },
  { value: "lentes_contacto", label: "Lentes de Contacto" },
  { value: "saude_ocular", label: "Saúde Ocular" },
  { value: "diversos", label: "Diversos" },
];

const DEFAULT_FILTERS: DashboardFilters = { period: "month", employee: "", category: "" };

interface GlobalFiltersProps {
  compact?: boolean;
  /** Colaboradores reais (Usuario da API). Se vazio, mostra só "Todos". */
  employees?: { value: string; label: string }[];
  /** Estado atual do filtro global (lido do cookie no servidor). */
  value?: DashboardFilters;
}

export function GlobalFilters({ compact, employees = [], value }: GlobalFiltersProps) {
  const router = useRouter();
  const current = value ?? DEFAULT_FILTERS;

  // Estado LOCAL espelha o filtro global (cookie). As datas ficam de imediato no
  // input mesmo com a página a recarregar. `key` no pai garante re-sync ao navegar.
  const [period, setPeriod] = useState(current.period);
  const [employee, setEmployee] = useState(current.employee);
  const [category, setCategory] = useState(current.category);
  const [fromDate, setFromDate] = useState(current.from ?? "");
  const [toDate, setToDate] = useState(current.to ?? "");

  // Grava o filtro GLOBAL no cookie e re-renderiza a página atual (router.refresh
  // relê os server components com o novo cookie). Ao navegar para outro menu, esse
  // menu lê o mesmo cookie → o período mantém-se em todos.
  const commit = useCallback(
    (next: DashboardFilters) => {
      const json = encodeURIComponent(JSON.stringify(next));
      document.cookie = `of_filters=${json}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const employeeOptions = [{ value: "", label: "Todos os colaboradores" }, ...employees];

  const cls = compact ? "text-xs py-1.5 h-8" : undefined;
  const label = (s: string) => (compact ? undefined : s);
  const dateInputCls =
    "bg-border border border-border-subtle rounded-lg text-text-primary px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]" +
    (compact ? " text-xs py-1.5 h-8" : "");

  return (
    <div className={compact ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-3 flex-wrap"}>
      {compact && <Filter size={14} className="text-text-muted shrink-0" />}
      <Select
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(v) => {
          setPeriod(v as DashboardFilters["period"]);
          // Ao sair de "custom" limpa as datas; ao entrar mantém as que houver.
          commit({ period: v as DashboardFilters["period"], from: v === "custom" ? fromDate : undefined, to: v === "custom" ? toDate : undefined, employee, category });
        }}
        className={cls}
        label={label("Período")}
      />

      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); commit({ period: "custom", from: e.target.value, to: toDate, employee, category }); }}
            className={dateInputCls}
            aria-label="De"
          />
          <span className="text-text-muted text-xs">até</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); commit({ period: "custom", from: fromDate, to: e.target.value, employee, category }); }}
            className={dateInputCls}
            aria-label="Até"
          />
        </div>
      )}

      <Select
        options={employeeOptions}
        value={employee}
        onChange={(v) => { setEmployee(v); commit({ period, from: fromDate || undefined, to: toDate || undefined, employee: v, category }); }}
        className={cls}
        label={label("Colaborador")}
      />
      <Select
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={(v) => { setCategory(v); commit({ period, from: fromDate || undefined, to: toDate || undefined, employee, category: v }); }}
        className={cls}
        label={label("Categoria")}
      />
    </div>
  );
}
