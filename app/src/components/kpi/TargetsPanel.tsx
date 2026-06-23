import Link from "next/link";
import { Target, Settings2 } from "lucide-react";
import { fetchTargetProgress } from "@/lib/api/adapter";
import { getTargetProgress } from "@/lib/snapshots/daily";
import {
  getMonthlyTargets,
  getSaudeOcularCodes,
  TARGET_LABELS,
  type TargetCategory,
} from "@/lib/targets/store";
import { formatCurrency, formatPercent } from "@/lib/utils";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Categorias por linha (o global é tratado à parte, em destaque).
const ROW_CATEGORIES: Exclude<TargetCategory, "global">[] = [
  "oculos_graduados", "oculos_sol", "lentes_contacto", "saude_ocular",
];

function barColor(pct: number): string {
  if (pct >= 100) return "#10b981"; // verde — atingido
  if (pct >= 75) return "#3b82f6"; // azul — quase lá
  if (pct >= 50) return "#f59e0b"; // âmbar
  return "#ef4444"; // vermelho — longe
}

/**
 * Painel de Objetivos do mês corrente. Os objetivos (€ de venda líquida) são
 * definidos pelo dono no Admin → Objetivos; cada barra só aparece se houver meta
 * definida para essa categoria nesse mês (sem objetivo = sem barra).
 */
export async function TargetsPanel({ canEdit = false }: { canEdit?: boolean }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1).toISOString();
  const to = now.toISOString();

  const [targets, saudeCodes] = await Promise.all([
    getMonthlyTargets(year, month),
    getSaudeOcularCodes(),
  ]);

  const hasAnyTarget = Object.keys(targets).length > 0;
  // O progresso vem dos agregados diários do Supabase (instantâneo, mesma região)
  // — derivados das MESMAS vendas líquidas que o cálculo ao vivo. Só se o snapshot
  // estiver vazio (ex.: cron ainda não correu) é que se cai na API Visual (lenta/
  // inacessível a partir da Vercel); se essa também falhar, mostram-se os objetivos
  // sem progresso (nunca derruba o dashboard).
  let progress = null;
  let progressFailed = false;
  if (hasAnyTarget) {
    try {
      progress = await getTargetProgress(monthStart, to);
      if (!progress) progress = await fetchTargetProgress(monthStart, to, saudeCodes);
    } catch {
      progressFailed = true;
    }
  }

  const header = (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-[#3b82f6]" />
        <h3 className="text-sm font-semibold text-text-primary">
          Objetivos · {MONTH_NAMES[month - 1]} {year}
        </h3>
      </div>
      {canEdit && (
        <Link
          href="/admin/objetivos"
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-[#3b82f6] transition-colors"
        >
          <Settings2 size={13} /> Definir
        </Link>
      )}
    </div>
  );

  // Objetivos definidos mas o progresso (API Visual) falhou → mantém o painel,
  // sem números inventados.
  if (hasAnyTarget && progressFailed) {
    return (
      <div className="rounded-xl bg-bg-card border border-border px-5 py-4">
        {header}
        <p className="text-xs text-text-muted mt-2">Progresso indisponível de momento.</p>
      </div>
    );
  }

  // Sem objetivos definidos para este mês → convite discreto (e nada inventado).
  if (!hasAnyTarget || !progress) {
    return (
      <div className="rounded-xl bg-bg-card border border-border px-5 py-4">
        {header}
        <p className="text-xs text-text-muted mt-2">
          Ainda não há objetivos definidos para {MONTH_NAMES[month - 1]}.{" "}
          {canEdit ? (
            <Link href="/admin/objetivos" className="text-[#3b82f6] hover:underline">
              Definir agora →
            </Link>
          ) : (
            "Pede ao administrador para os definir."
          )}
        </p>
      </div>
    );
  }

  const globalTarget = targets.global ?? 0;
  const globalActual = progress.global;
  const globalPct = globalTarget > 0 ? (globalActual / globalTarget) * 100 : 0;
  const remaining = Math.max(globalTarget - globalActual, 0);

  return (
    <div className="rounded-xl bg-bg-card border border-border px-5 py-4 space-y-4">
      {header}

      {/* Objetivo global em destaque */}
      {targets.global != null && (
        <div>
          <div className="flex items-end justify-between mb-1.5 flex-wrap gap-x-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-text-primary">{formatCurrency(globalActual)}</span>
              <span className="text-sm text-text-muted">/ {formatCurrency(globalTarget)}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold" style={{ color: barColor(globalPct) }}>
                {formatPercent(globalPct, 0)}
              </span>
              {remaining > 0 ? (
                <span className="text-text-muted"> · faltam {formatCurrency(remaining)}</span>
              ) : (
                <span className="text-[#10b981]"> · objetivo atingido 🎉</span>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(globalPct, 100)}%`, background: barColor(globalPct) }}
            />
          </div>
        </div>
      )}

      {/* Objetivos por categoria (só os definidos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {ROW_CATEGORIES.filter((c) => targets[c] != null).map((c) => {
          const target = targets[c] ?? 0;
          const actual = progress[c];
          const pct = target > 0 ? (actual / target) * 100 : 0;
          return (
            <div key={c}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-secondary">{TARGET_LABELS[c]}</span>
                <span className="text-text-strong">
                  {formatCurrency(actual)}{" "}
                  <span className="text-text-muted">/ {formatCurrency(target)}</span>{" "}
                  <span className="font-semibold" style={{ color: barColor(pct) }}>
                    ({formatPercent(pct, 0)})
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%`, background: barColor(pct) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
