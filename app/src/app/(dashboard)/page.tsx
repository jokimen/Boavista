import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { KpiCard } from "@/components/kpi/KpiCard";
import { AlertPanel } from "@/components/alerts/AlertPanel";
import { SalesLineChart } from "@/components/charts/SalesLineChart";
import { CategoryDrilldown } from "@/components/charts/CategoryDrilldown";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { TargetsPanel } from "@/components/kpi/TargetsPanel";
import { fetchSalesSummary, fetchSalesSummaryLight, fetchSalesTrend, fetchSalesByCategory, fetchAlerts, fetchEmployees } from "@/lib/api/adapter";
import { resolveDateRange, resolvePreviousRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { pctChange, marginIfCovered } from "@/lib/utils";

// Vendas SEMPRE ao vivo (API Visual, via adapter — cache curta de 5 min). Dar
// margem de tempo à função serverless para não morrer a meio no 1º cálculo.
export const maxDuration = 60;

// Falha de uma secção pesada (API Visual lenta/inacessível a partir da Vercel,
// cold-start, etc.) NÃO pode derrubar o dashboard inteiro. Cada secção em Suspense
// é tolerante a falhas: em erro mostra um fallback gracioso e o resto da página
// continua a funcionar (antes, um throw aqui subia ao error.tsx = "sistema abaixo").
function SectionUnavailable({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center text-xs text-text-muted h-[260px]">
      {message}
    </div>
  );
}

// Alertas em secção própria (Suspense) — são pesados (stock/clientes/encomendas)
// e não devem bloquear o resto do dashboard.
async function AlertsSection() {
  let alerts: Awaited<ReturnType<typeof fetchAlerts>>;
  try {
    alerts = await fetchAlerts();
  } catch {
    alerts = [];
  }
  return <AlertPanel alerts={alerts} maxItems={5} />;
}

// Evolução vs ano anterior — puxa 2 períodos (1 por ano), por isso carrega
// em Suspense para não bloquear o resto do dashboard.
async function TrendSection({ from, to }: { from: string; to: string }) {
  let trend: Awaited<ReturnType<typeof fetchSalesTrend>> | null;
  try {
    // Sempre ao vivo (API Visual, via adapter com cache curta).
    trend = await fetchSalesTrend(from, to);
  } catch {
    return <SectionUnavailable message="Evolução indisponível de momento." />;
  }
  return <SalesLineChart data={trend} />;
}

// Barra de filtros — os colaboradores vêm da API (lenta no 1º load). Em Suspense
// para a barra (período/datas) aparecer de imediato; a lista enche-se a seguir.
// Em falha (API Visual inacessível) cai para lista vazia — a barra continua usável.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try {
    employees = await fetchEmployees();
  } catch {
    employees = [];
  }
  return <GlobalFilters compact employees={employees} value={value} />;
}

// Cartão KPI indisponível (mantém o layout da grelha quando o cálculo ao vivo falha).
function KpiUnavailable() {
  return (
    <div className="rounded-xl bg-bg-card border border-border h-[92px] flex items-center justify-center text-xs text-text-muted">
      —
    </div>
  );
}

// KPIs de VENDAS — só REST (rápido), com comparação leve ao período anterior.
async function SalesKpis({ from, to, prev }: { from: string; to: string; prev: { from: string; to: string; label: string } }) {
  let cur, prv;
  try {
    [cur, prv] = await Promise.all([
      fetchSalesSummaryLight(from, to),
      fetchSalesSummaryLight(prev.from, prev.to),
    ]);
  } catch {
    return <>{Array.from({ length: 4 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  const kpis = [
    { label: "Vendas", value: cur.total_sales, unit: "€" as const, infoId: "kpi-vendas", change: pctChange(cur.total_sales, prv.total_sales), changePeriod: prev.label },
    { label: "Ticket Médio", value: cur.avg_ticket, unit: "€" as const, infoId: "kpi-ticket", change: pctChange(cur.avg_ticket, prv.avg_ticket), changePeriod: prev.label },
    { label: "Nº de Vendas", value: cur.num_sales, unit: "" as const, infoId: "kpi-num-vendas", change: pctChange(cur.num_sales, prv.num_sales), changePeriod: prev.label },
    { label: "Tx. Conversão", value: cur.conversion_rate, unit: "%" as const, infoId: "kpi-conversao", change: pctChange(cur.conversion_rate, prv.conversion_rate), changePeriod: prev.label },
  ];
  return <>{kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}</>;
}

// KPIs de MARGEM — pesados (artigos + OData de custos). Em Suspense próprio.
async function MarginKpis({ from, to }: { from: string; to: string }) {
  let s;
  try {
    s = await fetchSalesSummary(from, to);
  } catch {
    return <>{Array.from({ length: 2 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  const covered = marginIfCovered(s.margin_pct, s.cobertura_pct) !== null;
  const kpis = [
    covered
      ? { label: "Margem Bruta", value: s.total_margin, unit: "€" as const, infoId: "kpi-margem-cobertura" }
      : { label: "Margem Bruta", value: "—", unit: "" as const, infoId: "kpi-margem-cobertura" },
    covered
      ? { label: "Margem %", value: s.margin_pct, unit: "%" as const, infoId: "kpi-margem-cobertura" }
      : { label: "Margem %", value: "—", unit: "" as const, infoId: "kpi-margem-cobertura" },
  ];
  return <>{kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}</>;
}

// Vendas por categoria — chamada lenta (OData + artigos). Em Suspense.
async function CategorySection({ from, to, category }: { from: string; to: string; category: string }) {
  let byCategory: Awaited<ReturnType<typeof fetchSalesByCategory>>;
  try {
    const codes = await getSaudeOcularCodes();
    const allCategory = await fetchSalesByCategory(from, to, codes);
    byCategory = category ? allCategory.filter((c) => c.category === category) : allCategory;
  } catch {
    return <SectionUnavailable message="Categorias indisponíveis de momento." />;
  }
  return <CategoryDrilldown data={byCategory} />;
}

// Esqueleto de um cartão KPI (placeholder enquanto carrega).
function KpiSkeleton() {
  return <div className="rounded-xl bg-bg-card border border-border h-[92px] animate-pulse" />;
}

export default async function DashboardPage() {
  const session = await requireModule("dashboard");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const today = new Date();
  const prev = resolvePreviousRange(filters);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar
        title="Dashboard"
        subtitle={`${today.toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`}
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* Filters (período/datas aparecem já; colaboradores enchem a seguir) */}
        <Suspense fallback={<GlobalFilters compact employees={[]} value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>

        {/* Painel de objetivos do mês (definidos no Admin → Objetivos) */}
        <Suspense fallback={
          <div className="rounded-xl bg-bg-card border border-border px-5 py-4 text-xs text-text-muted min-h-[80px] flex items-center">
            A carregar objetivos…
          </div>
        }>
          <TargetsPanel canEdit={session.role === "superadmin"} />
        </Suspense>

        {/* KPI grid — sempre ao vivo (API Visual), em Suspense para não bloquear */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Suspense fallback={<>{Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <SalesKpis from={from} to={to} prev={prev} />
          </Suspense>
          <Suspense fallback={<>{Array.from({ length: 2 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <MarginKpis from={from} to={to} />
          </Suspense>
        </div>

        {/* Charts + Alerts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Trend chart */}
          <div className="xl:col-span-2 rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Evolução de Vendas — vs ano anterior</h3>
              <ChartInfo id="sales-trend" />
            </div>
            <Suspense fallback={
              <div className="flex items-center justify-center text-xs text-text-muted h-[260px]">A carregar evolução…</div>
            }>
              <TrendSection from={from} to={to} />
            </Suspense>
          </div>

          {/* Alerts (carregam à parte — são pesados) */}
          <Suspense fallback={
            <div className="rounded-xl bg-bg-card border border-border p-4 flex items-center justify-center text-xs text-text-muted min-h-[200px]">
              A calcular alertas…
            </div>
          }>
            <AlertsSection />
          </Suspense>
        </div>

        {/* Category sales */}
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <div className="flex items-center gap-1.5 mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Vendas por Categoria</h3>
            <ChartInfo id="category" />
          </div>
          <Suspense fallback={<div className="flex items-center justify-center text-xs text-text-muted h-[260px]">A carregar categorias…</div>}>
            <CategorySection from={from} to={to} category={filters.category} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
