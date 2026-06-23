/**
 * Validação de intervalos de datas para os endpoints de relatórios.
 * Evita sobrecarga acidental (ou abuso) contra a API Visual/OData, que é lenta:
 * rejeita datas inválidas, início ≥ fim, duração excessiva e anos fora do suportado.
 * Pura — sem dependências de servidor.
 */
export type RangeCheck =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

export function validateReportRange(fromISO: string | null, toISO: string | null, maxDays: number): RangeCheck {
  if (!fromISO || !toISO) return { ok: false, error: "from/to obrigatórios" };
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { ok: false, error: "Datas inválidas" };
  if (from.getTime() >= to.getTime()) return { ok: false, error: "Intervalo inválido (início ≥ fim)" };
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > maxDays) return { ok: false, error: `Intervalo demasiado longo (máx. ${maxDays} dias)` };
  const minYear = 2015, maxYear = new Date().getFullYear() + 1;
  if (from.getFullYear() < minYear || to.getFullYear() > maxYear) return { ok: false, error: "Datas fora do intervalo suportado" };
  return { ok: true, from: fromISO, to: toISO };
}
