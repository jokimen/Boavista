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
 * Período de COMPARAÇÃO = SEMPRE o período HOMÓLOGO do ano anterior: a mesma
 * janela [from, to) recuada exatamente 1 ano, para qualquer período.
 * Ex.: 1–13 Jul 2026 → 1–13 Jul 2025; mês-a-dia → mesmo mês-a-dia do ano
 * passado; hoje → mesmo dia do ano passado. Todos os badges "acima/abaixo"
 * comparam contra o homólogo do ano anterior.
 */
export function resolvePreviousRange(filters: DashboardFilters | PeriodKey): { from: string; to: string; label: string } {
  const { from, to } = resolveDateRange(filters);
  const pf = new Date(from); pf.setFullYear(pf.getFullYear() - 1);
  const pt = new Date(to); pt.setFullYear(pt.getFullYear() - 1);
  return { from: pf.toISOString(), to: pt.toISOString(), label: "período homólogo" };
}
