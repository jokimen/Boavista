import "server-only";
import { cookies } from "next/headers";
import { parseFilters, type DashboardFilters } from "./range";

/**
 * Filtro GLOBAL e persistente. O `GlobalFilters` (cliente) grava aqui um JSON com
 * {period, from, to, employee, category}; TODAS as páginas com âmbito de datas leem
 * este cookie via `getGlobalFilters()` — mudar o período num menu aplica-se a todos.
 * Não é sensível (só preferências de visualização) → cookie simples, sem HMAC.
 */
export const FILTERS_COOKIE = "of_filters";

/** Lê o filtro global do cookie (fallback: mês atual). Usar nas páginas (server). */
export async function getGlobalFilters(): Promise<DashboardFilters> {
  const store = await cookies();
  const raw = store.get(FILTERS_COOKIE)?.value;
  if (raw) {
    try {
      return parseFilters(JSON.parse(decodeURIComponent(raw)) as Record<string, string>);
    } catch {
      /* cookie corrompido → cai no default */
    }
  }
  return parseFilters({});
}
