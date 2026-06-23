"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { Select } from "@/components/ui/select";

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

interface GlobalFiltersProps {
  compact?: boolean;
  /** Colaboradores reais (Usuario da API). Se vazio, mostra só "Todos". */
  employees?: { value: string; label: string }[];
}

export function GlobalFilters({ compact, employees = [] }: GlobalFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = searchParams.get("period") ?? "month";
  const employee = searchParams.get("employee") ?? "";
  const category = searchParams.get("category") ?? "";

  // Datas com ESTADO LOCAL: ficam imediatamente no input (mesmo com a página lenta
  // a recarregar) e não dependem do searchParams, que pode estar desatualizado
  // durante uma navegação pendente.
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");

  const update = useCallback(
    (changes: Record<string, string>) => {
      // Lê o URL ATUAL do browser (não o searchParams em cache) para que alterações
      // consecutivas — ex.: 1ª e 2ª data — se acumulem em vez de se sobreporem.
      const base = typeof window !== "undefined" ? window.location.search : searchParams.toString();
      const params = new URLSearchParams(base);
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const employeeOptions = [
    { value: "", label: "Todos os colaboradores" },
    ...employees,
  ];

  const cls = compact ? "text-xs py-1.5 h-8" : undefined;
  const label = (s: string) => (compact ? undefined : s);
  const dateInputCls =
    "bg-border border border-border-subtle rounded-lg text-text-primary px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]" +
    (compact ? " text-xs py-1.5 h-8" : "");

  return (
    <div className={compact ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-3 flex-wrap"}>
      {compact && <Filter size={14} className="text-text-muted shrink-0" />}
      <Select options={PERIOD_OPTIONS} value={period} onChange={(v) => update({ period: v })} className={cls} label={label("Período")} />

      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); update({ period: "custom", from: e.target.value }); }}
            className={dateInputCls}
            aria-label="De"
          />
          <span className="text-text-muted text-xs">até</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); update({ period: "custom", to: e.target.value }); }}
            className={dateInputCls}
            aria-label="Até"
          />
        </div>
      )}

      <Select options={employeeOptions} value={employee} onChange={(v) => update({ employee: v })} className={cls} label={label("Colaborador")} />
      <Select options={CATEGORY_OPTIONS} value={category} onChange={(v) => update({ category: v })} className={cls} label={label("Categoria")} />
    </div>
  );
}
