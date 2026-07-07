import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { SalesLineChart } from "@/components/charts/SalesLineChart";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { DataTable } from "@/components/tables/DataTable";
import { fetchSalesSummary, fetchSalesSummaryLight, fetchSalesTrend, fetchSalesByCategory, fetchSalesByEmployee, fetchEmployees } from "@/lib/api/adapter";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { resolveDateRange, resolvePreviousRange, PERIOD_LABELS, type DashboardFilters } from "@/lib/filters/range";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, pctChange, marginIfCovered } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

function KpiSkeleton() {
  return <div className="rounded-xl bg-bg-card border border-border h-[92px] animate-pulse" />;
}
function KpiUnavailable() {
  return <div className="rounded-xl bg-bg-card border border-border h-[92px] flex items-center justify-center text-xs text-text-muted">—</div>;
}
function BoxFallback({ msg }: { msg: string }) {
  return <div className="flex items-center justify-center text-xs text-text-muted h-[260px]">{msg}</div>;
}

// KPIs rápidos (REST leve, sem OData): Vendas, Ticket, Nº, Descontos. Aparecem já.
async function FastKpis({ from, to, prevFrom, prevTo, prevLabel }: { from: string; to: string; prevFrom: string; prevTo: string; prevLabel: string }) {
  let s, p;
  try {
    [s, p] = await Promise.all([fetchSalesSummaryLight(from, to), fetchSalesSummaryLight(prevFrom, prevTo)]);
  } catch {
    return <>{Array.from({ length: 4 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  return (
    <>
      <KpiCard data={{ label: "Vendas Acumuladas", value: s.total_sales, unit: "€", infoId: "kpi-vendas", change: pctChange(s.total_sales, p.total_sales), changePeriod: prevLabel }} />
      <KpiCard data={{ label: "Ticket Médio", value: s.avg_ticket, unit: "€", infoId: "kpi-ticket", change: pctChange(s.avg_ticket, p.avg_ticket), changePeriod: prevLabel }} />
      <KpiCard data={{ label: "Nº Vendas", value: s.num_sales, unit: "", infoId: "kpi-num-vendas", change: pctChange(s.num_sales, p.num_sales), changePeriod: prevLabel }} />
      <KpiCard data={{ label: "Descontos", value: s.total_discount, unit: "€", infoId: "kpi-descontos", change: pctChange(s.total_discount, p.total_discount), changePeriod: prevLabel }} />
    </>
  );
}

// KPIs pesados (OData: margem + conversão real). Suspense próprio para não bloquear.
async function SlowKpis({ from, to, prevFrom, prevTo, prevLabel }: { from: string; to: string; prevFrom: string; prevTo: string; prevLabel: string }) {
  let s, p;
  try {
    [s, p] = await Promise.all([fetchSalesSummary(from, to), fetchSalesSummary(prevFrom, prevTo)]);
  } catch {
    return <>{Array.from({ length: 2 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  const margin = marginIfCovered(s.margin_pct, s.cobertura_pct);
  return (
    <>
      <KpiCard data={margin !== null
        ? { label: "Margem", value: margin, unit: "%", infoId: "kpi-margem-cobertura", change: pctChange(s.margin_pct, p.margin_pct), changePeriod: prevLabel }
        : { label: "Margem", value: "—", unit: "", infoId: "kpi-margem-cobertura" }} />
      <KpiCard data={{ label: "Taxa Conversão", value: s.conversion_rate, unit: "%", infoId: "kpi-conversao", change: pctChange(s.conversion_rate, p.conversion_rate), changePeriod: prevLabel }} />
    </>
  );
}

// Evolução vs ano anterior (2 períodos) — sempre ao vivo, em Suspense.
async function TrendSection({ from, to }: { from: string; to: string }) {
  const trend = await fetchSalesTrend(from, to);
  return <SalesLineChart data={trend} />;
}

// Ranking por categoria (OData) — Suspense próprio.
async function CategorySection({ from, to }: { from: string; to: string }) {
  let byCategory: Awaited<ReturnType<typeof fetchSalesByCategory>> = [];
  try { byCategory = await fetchSalesByCategory(from, to, await getSaudeOcularCodes()); } catch { return <BoxFallback msg="Categorias indisponíveis de momento." />; }
  return <CategoryBarChart data={byCategory} />;
}

// Desempenho por colaborador — Suspense próprio.
async function EmployeeSection({ from, to }: { from: string; to: string }) {
  let byEmployee: Awaited<ReturnType<typeof fetchSalesByEmployee>> = [];
  try { byEmployee = await fetchSalesByEmployee(from, to); } catch { byEmployee = []; }
  return (
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
                <Badge variant={pct >= 100 ? "success" : pct >= 75 ? "warning" : "danger"}>{formatPercent(pct, 0)}</Badge>
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
  );
}

export default async function MesPage() {
  await requireModule("mes");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const prev = resolvePreviousRange(filters);
  const subtitle = filters.period === "custom" && filters.from && filters.to
    ? `${filters.from} a ${filters.to}`
    : PERIOD_LABELS[filters.period];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Mês" subtitle={subtitle} />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Suspense fallback={<>{Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <FastKpis from={from} to={to} prevFrom={prev.from} prevTo={prev.to} prevLabel={prev.label} />
          </Suspense>
          <Suspense fallback={<>{Array.from({ length: 2 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <SlowKpis from={from} to={to} prevFrom={prev.from} prevTo={prev.to} prevLabel={prev.label} />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Evolução — mesmo período (ano anterior)</h3>
              <ChartInfo id="sales-trend" />
            </div>
            <Suspense fallback={<BoxFallback msg="A carregar evolução…" />}>
              <TrendSection from={from} to={to} />
            </Suspense>
          </div>
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Ranking por Categoria</h3>
              <ChartInfo id="category" />
            </div>
            <Suspense fallback={<BoxFallback msg="A carregar categorias…" />}>
              <CategorySection from={from} to={to} />
            </Suspense>
          </div>
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Desempenho por Colaborador</h3>
          <Suspense fallback={<BoxFallback msg="A carregar colaboradores…" />}>
            <EmployeeSection from={from} to={to} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
