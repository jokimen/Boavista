import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { SalesLineChart } from "@/components/charts/SalesLineChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { DataTable } from "@/components/tables/DataTable";
import { fetchSalesSummary, fetchSalesTrend, fetchSalesByCategory, fetchSalesByEmployee } from "@/lib/api/adapter";
import { getRangeMetrics, getSalesTrend } from "@/lib/snapshots/daily";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, pctChange, marginIfCovered } from "@/lib/utils";

// Evolução vs ano anterior (2 períodos: ex. 2026 vs 2025) — em Suspense para não bloquear a página.
// Snapshot diário do Firestore (instantâneo); só cai no cálculo ao vivo se não houver dias.
async function TrendSection({ from, to }: { from: string; to: string }) {
  const trend = (await getSalesTrend(from, to)) ?? (await fetchSalesTrend(from, to));
  return <SalesLineChart data={trend} />;
}

export default async function MesPage() {
  await requireModule("mes");
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const to = today.toISOString().split("T")[0];
  // Mês anterior à mesma altura (mês-a-dia), para a comparação "vs mês ant.".
  const prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split("T")[0];
  const prevTo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().split("T")[0];

  // Agregados diários do Firestore (instantâneo) para o intervalo; fallback ao vivo
  // se o snapshot não cobrir os dias. byEmployee usa campos ricos (objetivos/orçamentos)
  // que o snapshot diário não guarda → fica sempre ao vivo.
  const saudeCodes = getSaudeOcularCodes();
  const [ranged, rangedPrev] = await Promise.all([
    getRangeMetrics(from, to).catch(() => null),
    getRangeMetrics(prevFrom, prevTo).catch(() => null),
  ]);
  const [summary, prevSummary, byCategory, byEmployee] = await Promise.all([
    ranged?.summary ?? fetchSalesSummary(from, to),
    rangedPrev?.summary ?? fetchSalesSummary(prevFrom, prevTo),
    ranged?.byCategory ?? saudeCodes.then((codes) => fetchSalesByCategory(from, to, codes)),
    fetchSalesByEmployee(from, to),
  ]);

  // Margem só quando a cobertura (custo conhecido) é suficiente; senão "—" (a aguardar faturas).
  const margin = marginIfCovered(summary.margin_pct, summary.cobertura_pct);
  const marginKpi = margin !== null
    ? { label: "Margem Mês", value: margin, unit: "%" as const, infoId: "kpi-margem-cobertura", change: pctChange(summary.margin_pct, prevSummary.margin_pct), changePeriod: "mês ant." }
    : { label: "Margem Mês", value: "—", unit: "" as const, infoId: "kpi-margem-cobertura" };

  const kpis = [
    { label: "Vendas Acumuladas", value: summary.total_sales, unit: "€" as const, infoId: "kpi-vendas", change: pctChange(summary.total_sales, prevSummary.total_sales), changePeriod: "mês ant." },
    marginKpi,
    { label: "Ticket Médio", value: summary.avg_ticket, unit: "€" as const, infoId: "kpi-ticket", change: pctChange(summary.avg_ticket, prevSummary.avg_ticket), changePeriod: "mês ant." },
    { label: "Nº Vendas", value: summary.num_sales, unit: "" as const, infoId: "kpi-num-vendas", change: pctChange(summary.num_sales, prevSummary.num_sales), changePeriod: "mês ant." },
    { label: "Taxa Conversão", value: summary.conversion_rate, unit: "%" as const, infoId: "kpi-conversao", change: pctChange(summary.conversion_rate, prevSummary.conversion_rate), changePeriod: "mês ant." },
    { label: "Descontos", value: summary.total_discount, unit: "€" as const, infoId: "kpi-descontos", change: pctChange(summary.total_discount, prevSummary.total_discount), changePeriod: "mês ant." },
  ];

  const monthName = today.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Mês" subtitle={monthName.charAt(0).toUpperCase() + monthName.slice(1)} />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Evolução — mesmo período (ano anterior)</h3>
              <ChartInfo id="sales-trend" />
            </div>
            <Suspense fallback={
              <div className="flex items-center justify-center text-xs text-text-muted h-[260px]">A carregar evolução…</div>
            }>
              <TrendSection from={from} to={to} />
            </Suspense>
          </div>
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Ranking por Categoria</h3>
              <ChartInfo id="category" />
            </div>
            <CategoryBarChart data={byCategory} />
          </div>
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Desempenho por Colaborador</h3>
          <DataTable
            data={byEmployee}
            keyField="employee_id"
            columns={[
              { key: "name", label: "Colaborador" },
              { key: "sales_month", label: "Vendas", sortable: true, render: row => <span className="font-medium">{formatCurrency(row.sales_month)}</span> },
              {
                key: "target", label: "Objetivo", render: row => {
                  const pct = (row.sales_month / row.target) * 100;
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted text-xs">{formatCurrency(row.target)}</span>
                      <Badge variant={pct >= 100 ? "success" : pct >= 75 ? "warning" : "danger"}>
                        {formatPercent(pct, 0)}
                      </Badge>
                    </div>
                  );
                }
              },
              { key: "margin_pct", label: "Margem %", sortable: true, render: row => <span className="text-[#10b981]">{formatPercent(row.margin_pct)}</span> },
              { key: "avg_ticket", label: "Ticket Médio", sortable: true, render: row => formatCurrency(row.avg_ticket) },
              { key: "discount_avg", label: "Desc. Médio", render: row => <span className={row.discount_avg > 8 ? "text-[#ef4444]" : "text-text-secondary"}>{formatPercent(row.discount_avg)}</span> },
              { key: "quotes_converted", label: "Orç. Convertidos", render: row => `${row.quotes_converted}/${row.quotes_issued}` },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
