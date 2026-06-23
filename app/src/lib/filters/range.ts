/**
 * Filtros globais — resolução de período em intervalo de datas e parsing dos
 * parâmetros de URL (period / from / to / employee / category). Usado pelas
 * páginas (server) para alimentar os fetchers e filtrar os dados.
 */

export type PeriodKey = "today" | "week" | "month" | "last_month" | "quarter" | "year" | "custom";

export interface DashboardFilters {
  period: PeriodKey;
  /** Datas personalizadas (YYYY-MM-DD) quando period === "custom". */
  from?: string;
  to?: string;
  employee: string;
  category: string;
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
  last_month: "Mês anterior",
  quarter: "Trimestre",
  year: "Este ano",
  custom: "Personalizado",
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/** Lê os filtros a partir dos searchParams da página. */
export function parseFilters(sp: SearchParams): DashboardFilters {
  const period = (first(sp.period) || "month") as PeriodKey;
  return {
    period: period in PERIOD_LABELS ? period : "month",
    from: first(sp.from) || undefined,
    to: first(sp.to) || undefined,
    employee: first(sp.employee),
    category: first(sp.category),
  };
}

const isYmd = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Converte os filtros num intervalo [from, to). */
export function resolveDateRange(filters: DashboardFilters | PeriodKey): { from: string; to: string } {
  // Compatibilidade: aceita ainda uma PeriodKey simples.
  const f: DashboardFilters =
    typeof filters === "string" ? { period: filters, employee: "", category: "" } : filters;
  const now = new Date();

  if (f.period === "custom" && isYmd(f.from) && isYmd(f.to)) {
    const [fy, fm, fd] = f.from.split("-").map(Number);
    const [ty, tm, td] = f.to.split("-").map(Number);
    const start = new Date(fy, fm - 1, fd);
    const end = new Date(ty, tm - 1, td + 1); // inclui o dia final (limite exclusivo no dia seguinte)
    // Só aceita intervalos válidos e não exagerados (≤ ~13 meses); senão cai no default (mês).
    const MAX_MS = 400 * 86_400_000;
    if (end.getTime() > start.getTime() && end.getTime() - start.getTime() <= MAX_MS) {
      return { from: start.toISOString(), to: end.toISOString() };
    }
  }

  let start: Date;
  switch (f.period) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week": {
      const dow = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + 1);
      break;
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "month":
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from: start.toISOString(), to: now.toISOString() };
}

/**
 * Período de COMPARAÇÃO homólogo anterior (para os badges "vs … ant.").
 *  - month/last_month → mesma janela recuada 1 mês (ex.: mês-a-dia vs mês anterior à mesma altura);
 *  - year → mesma janela recuada 1 ano;
 *  - resto → janela imediatamente anterior de igual duração.
 * Devolve também o rótulo a mostrar.
 */
export function resolvePreviousRange(filters: DashboardFilters | PeriodKey): { from: string; to: string; label: string } {
  const period = typeof filters === "string" ? filters : filters.period;
  const { from, to } = resolveDateRange(filters);
  const fromD = new Date(from);
  const toD = new Date(to);

  if (period === "month" || period === "last_month") {
    const pf = new Date(fromD); pf.setMonth(pf.getMonth() - 1);
    const pt = new Date(toD); pt.setMonth(pt.getMonth() - 1);
    return { from: pf.toISOString(), to: pt.toISOString(), label: "mês ant." };
  }
  if (period === "year") {
    const pf = new Date(fromD); pf.setFullYear(pf.getFullYear() - 1);
    const pt = new Date(toD); pt.setFullYear(pt.getFullYear() - 1);
    return { from: pf.toISOString(), to: pt.toISOString(), label: "ano ant." };
  }
  const dur = Math.max(toD.getTime() - fromD.getTime(), 1);
  return { from: new Date(fromD.getTime() - dur).toISOString(), to: from, label: "período ant." };
}
