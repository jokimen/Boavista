/**
 * Motor de alertas — calcula os alertas de gestão a partir dos dados do
 * dashboard (via adapter, logo funciona com mock agora e com a API real depois).
 *
 * Cobre os alertas do plano: margem abaixo do mínimo, vendas abaixo do objetivo,
 * encomendas atrasadas, vendas por entregar há demasiado tempo, orçamentos
 * pendentes, stock parado, rutura de stock e lentes de contacto a acabar.
 */

import type { Alert, AlertSeverity } from "@/types";
import {
  fetchSalesSummary,
  fetchStock,
  fetchOrders,
  fetchClients,
  fetchDiscounts,
  fetchClinicalRecall,
  fetchCrossSell,
  fetchTreatmentAttach,
} from "@/lib/api/adapter";
import { getMonthlyTargets } from "@/lib/targets/store";

// ─── Limiares configuráveis (env com defaults) ───────────────────────────────

const numEnv = (key: string, def: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

const CFG = {
  monthlyTarget: numEnv("ALERT_MONTHLY_TARGET", 55_000),
  minMarginPct: numEnv("ALERT_MIN_MARGIN_PCT", 50),
  readyMaxDays: numEnv("ALERT_READY_MAX_DAYS", 15),
  quotePendingDays: numEnv("ALERT_QUOTE_PENDING_DAYS", 3),
  stockStaleDays: numEnv("ALERT_STOCK_STALE_DAYS", 180),
  lowStockQty: numEnv("ALERT_LOW_STOCK_QTY", 2),
  lensRefillDays: numEnv("ALERT_LENS_REFILL_DAYS", 14),
  minTreatmentPct: numEnv("ALERT_MIN_TREATMENT_PCT", 60),
};

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Janela dos ÚLTIMOS 2 MESES (decisão do dono: esquecer o que está mais atrás). */
function twoMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Fração do mês já decorrida (1..0), para avaliar ritmo de vendas. */
function monthElapsedFraction(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
}

let seq = 0;
function alert(
  severity: AlertSeverity,
  module: string,
  message: string,
  detail?: string,
  action_url?: string,
): Alert {
  return {
    id: `eng-${Date.now()}-${seq++}`,
    severity,
    module,
    message,
    detail,
    action_url,
    created_at: new Date().toISOString(),
    is_read: false,
  };
}

const eur = (n: number) => `€${Math.round(n).toLocaleString("pt-PT")}`;

/** Calcula a lista de alertas ativos. */
export async function computeAlerts(opts?: { admin?: boolean }): Promise<Alert[]> {
  const month = monthRange();
  const twoM = twoMonthRange();
  const today = new Date();
  const [monthSummary, summary, stockData, orders, clients, discounts, targets, recall, crossSell, treatments] = await Promise.all([
    fetchSalesSummary(month.from, month.to),       // mês atual (ritmo vs objetivo)
    fetchSalesSummary(twoM.from, twoM.to),          // últimos 2 meses (margem)
    fetchStock(),
    fetchOrders(),
    fetchClients(),
    fetchDiscounts(twoM.from, twoM.to),             // descontos dos últimos 2 meses
    getMonthlyTargets(today.getFullYear(), today.getMonth() + 1),
    fetchClinicalRecall(),                          // recall clínico (proxy por compras)
    fetchCrossSell(twoM.from, twoM.to),             // cross-sell 2º par/sol (2 meses)
    fetchTreatmentAttach(twoM.from, twoM.to),       // attach de progressivos/tratamentos
  ]);
  // Objetivo mensal REAL (Admin → Objetivos). Sem objetivo definido → não há alerta de ritmo.
  const monthlyTarget = targets.global ?? 0;

  const out: Alert[] = [];

  // 1) Margem abaixo do mínimo
  if (summary.margin_pct < CFG.minMarginPct) {
    out.push(
      alert(
        "critical",
        "vendas",
        `Margem média caiu para ${summary.margin_pct}%`,
        `Abaixo do mínimo definido de ${CFG.minMarginPct}%. Verificar descontos aplicados.`,
        "/descontos",
      ),
    );
  }

  // 2) Vendas abaixo do esperado (ritmo vs objetivo mensal real). Só se houver objetivo definido.
  const pace = monthElapsedFraction();
  const expected = monthlyTarget * pace;
  const cumprimento = monthlyTarget > 0 ? Math.round((monthSummary.total_sales / monthlyTarget) * 100) : 0;
  if (monthlyTarget > 0 && monthSummary.total_sales < expected * 0.9) {
    out.push(
      alert(
        "warning",
        "mes",
        `Vendas do mês abaixo do ritmo esperado`,
        `${eur(monthSummary.total_sales)} de ${eur(monthlyTarget)} (${cumprimento}%). Esperado a esta altura: ~${eur(expected)}.`,
        "/mes",
      ),
    );
  } else if (monthlyTarget > 0) {
    out.push(
      alert(
        "info",
        "mes",
        `Cumprimento do objetivo mensal: ${cumprimento}%`,
        `${eur(monthSummary.total_sales)} de ${eur(monthlyTarget)}.`,
        "/mes",
      ),
    );
  }

  // 3) Encomendas atrasadas
  const overdue = orders.filter((o) => o.is_overdue);
  if (overdue.length > 0) {
    const names = overdue.slice(0, 3).map((o) => o.client_name).join(", ");
    out.push(
      alert(
        "warning",
        "operacao",
        `${overdue.length} encomenda(s) em atraso`,
        `${names}${overdue.length > 3 ? "…" : ""}`,
        "/operacao",
      ),
    );
  }

  // 4) Prontas para entrega há mais de N dias
  const stuckReady = orders.filter(
    (o) => o.status === "pronta_entrega" && o.days_in_status > CFG.readyMaxDays,
  );
  if (stuckReady.length > 0) {
    out.push(
      alert(
        "critical",
        "operacao",
        `${stuckReady.length} venda(s) por entregar há mais de ${CFG.readyMaxDays} dias`,
        stuckReady
          .slice(0, 3)
          .map((o) => `${o.client_name} (há ${o.days_in_status} dias)`)
          .join(", "),
        "/operacao",
      ),
    );
  }

  // 5) Orçamentos pendentes há mais de N dias
  const pendingQuotes = orders.filter(
    (o) => o.status === "orcamento_emitido" && o.days_in_status > CFG.quotePendingDays,
  );
  if (pendingQuotes.length > 0) {
    out.push(
      alert(
        "warning",
        "pipeline",
        `${pendingQuotes.length} orçamento(s) pendente(s) há mais de ${CFG.quotePendingDays} dias`,
        pendingQuotes
          .slice(0, 3)
          .map((o) => `${o.client_name} (${eur(o.amount)})`)
          .join(", "),
        "/pipeline",
      ),
    );
  }

  // 6) Stock parado há mais de N dias
  const stale = stockData.items.filter((i) => i.days_without_sale > CFG.stockStaleDays);
  if (stale.length > 0) {
    const capital = stale.reduce((s, i) => s + i.cost * i.quantity, 0);
    out.push(
      alert(
        "warning",
        "stock",
        `${stale.length} artigo(s) sem venda há mais de ${CFG.stockStaleDays} dias`,
        `Capital empatado: ~${eur(capital)}. ${stale
          .slice(0, 3)
          .map((i) => `${i.brand} ${i.model}`)
          .join(", ")}…`,
        "/stock",
      ),
    );
  }

  // 7) Rutura / stock baixo
  const lowStock = stockData.items.filter((i) => i.quantity <= CFG.lowStockQty);
  if (lowStock.length > 0) {
    out.push(
      alert(
        "warning",
        "stock",
        `${lowStock.length} artigo(s) com stock baixo (≤ ${CFG.lowStockQty} un.)`,
        lowStock
          .slice(0, 3)
          .map((i) => `${i.brand} ${i.model} (${i.quantity})`)
          .join(", "),
        "/stock",
      ),
    );
  }

  // 8b) Produtos vendidos com desconto excessivo
  if (discounts.excessive_count > 0) {
    out.push(
      alert(
        "warning",
        "descontos",
        `${discounts.excessive_count} venda(s) com desconto excessivo (últimos 2 meses)`,
        `Desconto médio (2 meses): ${discounts.avg_discount_pct}%. ${
          discounts.below_min_margin.length
        } venda(s) abaixo da margem mínima.`,
        "/descontos",
      ),
    );
  }

  // 8) Lentes de contacto a acabar
  const now = Date.now();
  const refillSoon = clients.filter((c) => {
    if (!c.next_lens_refill) return false;
    const d = new Date(c.next_lens_refill).getTime();
    const days = (d - now) / 86_400_000;
    return days >= 0 && days <= CFG.lensRefillDays;
  });
  if (refillSoon.length > 0) {
    out.push(
      alert(
        "info",
        "clientes",
        `${refillSoon.length} cliente(s) com lentes de contacto a acabar em ${CFG.lensRefillDays} dias`,
        refillSoon.slice(0, 4).map((c) => c.name).join(", "),
        "/clientes",
      ),
    );
  }

  // 10) Recall de Optometria (sem exame/óculos graduados há +2 anos)
  if (recall.optometria.length > 0) {
    out.push(
      alert(
        "warning",
        "clientes",
        `${recall.optometria.length} cliente(s) para recall de Optometria`,
        `Sem óculos graduados há +2 anos. Top: ${recall.optometria.slice(0, 4).map((c) => c.client_name).join(", ")}. Contactar para marcar exame.`,
        "/clientes",
      ),
    );
  }

  // 11) Recall de Contactologia (sem LC há +1 ano)
  if (recall.contactologia.length > 0) {
    out.push(
      alert(
        "warning",
        "clientes",
        `${recall.contactologia.length} cliente(s) para recall de Contactologia`,
        `Sem lentes de contacto há +1 ano. Top: ${recall.contactologia.slice(0, 4).map((c) => c.client_name).join(", ")}.`,
        "/clientes",
      ),
    );
  }

  // 12) Cross-sell: óculos graduados sem óculos de sol (2º par / sol)
  if (crossSell.length > 0) {
    const oppValue = crossSell.reduce((s, r) => s + r.value, 0);
    out.push(
      alert(
        "info",
        "vendas",
        `${crossSell.length} oportunidade(s) de 2º par / óculos de sol`,
        `Clientes que levaram graduados sem sol (últimos 2 meses) — ${eur(oppValue)} já faturados. Abordar para par de sol graduado.`,
        "/vendas",
      ),
    );
  }

  // 13) Attach de tratamentos baixo (alavanca de margem)
  if (treatments.total_lenses >= 10 && treatments.treatment_pct < CFG.minTreatmentPct) {
    out.push(
      alert(
        "info",
        "vendas",
        `Só ${treatments.treatment_pct}% das lentes levaram tratamento`,
        `Abaixo do alvo de ${CFG.minTreatmentPct}%. ${treatments.progressive_pct}% progressivos. Oportunidade de subir margem com tratamentos premium.`,
        "/vendas",
      ),
    );
  }

  // Ordena por severidade (critical → warning → info)
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Formata os alertas para uma mensagem de texto (WhatsApp / email). */
export function formatAlertsText(alerts: Alert[]): string {
  if (alerts.length === 0) return "Sem alertas ativos. ✅";
  const icon: Record<AlertSeverity, string> = { critical: "🔴", warning: "🟡", info: "🔵" };
  return alerts
    .map((a) => `${icon[a.severity]} ${a.message}${a.detail ? `\n   ${a.detail}` : ""}`)
    .join("\n\n");
}
