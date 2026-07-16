import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { CategoryDrilldown } from "@/components/charts/CategoryDrilldown";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { DataTable } from "@/components/tables/DataTable";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { CrossSellTable } from "./CrossSellTable";
import { MonthlyReportButton } from "./MonthlyReportButton";
import { resolveDateRange, resolvePreviousRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { fetchSalesSummary, fetchSalesSummaryLight, fetchSalesTicketsBySector, fetchSalesByCategory, fetchSalesByEmployee, fetchEmployees, fetchTopBrands, fetchCrossSell, fetchSecondPairSales, fetchTreatmentAttach } from "@/lib/api/adapter";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { ExportData } from "@/components/tables/ExportData";
import { canExport } from "@/lib/auth/permissions";
import { formatCurrency, formatPercent, pctChange, marginIfCovered } from "@/lib/utils";

const BoxFallback = ({ msg }: { msg: string }) => (
  <div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted h-[120px] flex items-center justify-center">{msg}</div>
);

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense para a
// barra aparecer de imediato.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

const KpiSkeleton = () => <div className="rounded-xl bg-bg-card border border-border h-[92px] animate-pulse" />;
const KpiUnavailable = () => <div className="rounded-xl bg-bg-card border border-border h-[92px] flex items-center justify-center text-xs text-text-muted">—</div>;

// KPIs rápidos (REST leve, sem OData): Total Vendas + Ticket balcão/clínica. ~1-2s.
async function FastKpis({ from, to, prevFrom, prevTo, prevLabel }: { from: string; to: string; prevFrom: string; prevTo: string; prevLabel: string }) {
  let s, p, tkt, tktPrev;
  try {
    [s, p, tkt, tktPrev] = await Promise.all([
      fetchSalesSummaryLight(from, to),
      fetchSalesSummaryLight(prevFrom, prevTo),
      fetchSalesTicketsBySector(from, to),
      fetchSalesTicketsBySector(prevFrom, prevTo),
    ]);
  } catch {
    return <>{Array.from({ length: 3 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  return (
    <>
      <KpiCard data={{ label: "Total Vendas", value: s.total_sales, unit: "€", infoId: "kpi-vendas", change: pctChange(s.total_sales, p.total_sales), changePeriod: prevLabel }} />
      <KpiCard data={{ label: "Ticket Médio Balcão", value: tkt.balcao, unit: "€", infoId: "kpi-ticket-balcao", change: pctChange(tkt.balcao, tktPrev.balcao), changePeriod: prevLabel }} />
      <KpiCard data={{ label: "Ticket Médio Clínica", value: tkt.clinica, unit: "€", infoId: "kpi-ticket-clinica", change: pctChange(tkt.clinica, tktPrev.clinica), changePeriod: prevLabel }} />
    </>
  );
}

// KPIs de margem (pesados: custos via OData). Suspense próprio. Margem só com cobertura ≥80%.
async function MarginKpis({ from, to, prevFrom, prevTo, prevLabel }: { from: string; to: string; prevFrom: string; prevTo: string; prevLabel: string }) {
  let summary, prevSummary;
  try {
    [summary, prevSummary] = await Promise.all([fetchSalesSummary(from, to), fetchSalesSummary(prevFrom, prevTo)]);
  } catch {
    return <>{Array.from({ length: 2 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  const covered = marginIfCovered(summary.margin_pct, summary.cobertura_pct) !== null;
  return (
    <>
      <KpiCard data={covered
        ? { label: "Margem Bruta", value: summary.total_margin, unit: "€", infoId: "kpi-margem-cobertura", change: pctChange(summary.total_margin, prevSummary.total_margin), changePeriod: prevLabel }
        : { label: "Margem Bruta", value: "—", unit: "", infoId: "kpi-margem-cobertura" }} />
      <KpiCard data={covered
        ? { label: "Margem %", value: summary.margin_pct, unit: "%", infoId: "kpi-margem-cobertura", change: pctChange(summary.margin_pct, prevSummary.margin_pct), changePeriod: prevLabel }
        : { label: "Margem %", value: "—", unit: "", infoId: "kpi-margem-cobertura" }} />
    </>
  );
}

async function CategorySection({ from, to, category }: { from: string; to: string; category: string | null }) {
  // Sempre ao vivo (API Visual, via adapter com cache curta).
  const all = await fetchSalesByCategory(from, to, await getSaudeOcularCodes());
  const byCategory = category ? all.filter((c) => c.category === category) : all;
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Vendas por Categoria</h3>
        <ChartInfo id="category" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CategoryDrilldown data={byCategory} />
        <DataTable
          data={byCategory}
          keyField="category"
          columns={[
            { key: "label", label: "Categoria" },
            { key: "sales", label: "Vendas", sortable: true, render: row => <span className="font-medium">{formatCurrency(row.sales)}</span> },
            { key: "margin_pct", label: "Margem %", sortable: true, render: row => <span className="text-[#10b981]">{formatPercent(row.margin_pct)}</span> },
            { key: "quantity", label: "Qtd.", sortable: true },
            { key: "avg_ticket", label: "Ticket Médio", sortable: true, render: row => formatCurrency(row.avg_ticket) },
          ]}
        />
      </div>
    </div>
  );
}

function BrandTable({ rows }: { rows: { brand: string; qty: number; sales: number; margin_pct: number; second_pair_sales: number }[] }) {
  return (
    <DataTable
      data={rows.map((b, i) => ({ ...b, id: String(i) }))}
      keyField="id"
      maxHeight="max-h-80"
      columns={[
        { key: "brand", label: "Marca" },
        { key: "qty", label: "Qtd.", sortable: true, render: r => <span className="font-medium">{r.qty}</span> },
        { key: "sales", label: "Vendas", sortable: true, render: r => formatCurrency(r.sales) },
        { key: "margin_pct", label: "Margem %", render: r => <span className="text-[#10b981]">{r.margin_pct > 0 ? formatPercent(r.margin_pct) : "—"}</span> },
        { key: "second_pair_sales", label: "2º par", render: r => r.second_pair_sales > 0 ? <span className="text-[#a78bfa]">{r.second_pair_sales}</span> : <span className="text-text-muted">—</span> },
      ]}
    />
  );
}

async function BrandsSection({ from, to }: { from: string; to: string }) {
  const saudeCodes = await getSaudeOcularCodes();
  const brands = await fetchTopBrands(from, to, saudeCodes);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Lentes Oftálmicas — Top Marcas</h3>
        <p className="text-xs text-text-muted mb-3">Marca = fornecedor da lente (inclui lentes de laboratório). Ordenado por quantidade.</p>
        <BrandTable rows={brands.lentes_oftalmicas} />
      </div>
      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Armações — Top Marcas</h3>
        <p className="text-xs text-text-muted mb-3">Ordenado por quantidade vendida.</p>
        <BrandTable rows={brands.armacoes} />
      </div>
    </div>
  );
}

async function EmployeeSection({ from, to, employee, canExportVendas }: { from: string; to: string; employee: string | null; canExportVendas: boolean }) {
  const all = await fetchSalesByEmployee(from, to);
  const byEmployee = employee ? all.filter((e) => e.employee_id === employee) : all;
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-sm font-semibold text-text-primary">Vendas por Colaborador</h3>
        <ExportData
          title="Vendas por colaborador"
          canExport={canExportVendas}
          columns={[
            { key: "name", label: "Colaborador" },
            { key: "sales_month", label: "Vendas" },
            { key: "margin_pct", label: "Margem %" },
            { key: "avg_ticket", label: "Ticket Médio" },
            { key: "discount_avg", label: "Desc. Médio %" },
            { key: "quotes_issued", label: "Orçamentos" },
            { key: "quotes_converted", label: "Convertidos" },
          ]}
          rows={byEmployee}
        />
      </div>
      <DataTable
        data={byEmployee}
        keyField="employee_id"
        maxHeight="max-h-96"
        columns={[
          { key: "name", label: "Colaborador" },
          { key: "sales_month", label: "Vendas", sortable: true, render: r => <span className="font-medium">{formatCurrency(r.sales_month)}</span> },
          { key: "margin_pct", label: "Margem %", sortable: true, render: r => <span className="text-[#10b981]">{formatPercent(r.margin_pct)}</span> },
          { key: "avg_ticket", label: "Ticket Médio", sortable: true, render: r => formatCurrency(r.avg_ticket) },
          { key: "discount_avg", label: "Desc. Médio", sortable: true, render: r => <span className={r.discount_avg > 8 ? "text-[#ef4444]" : ""}>{formatPercent(r.discount_avg)}</span> },
          { key: "quotes_converted", label: "Orç. Conv.", render: r => `${r.quotes_converted}/${r.quotes_issued}` },
        ]}
      />
    </div>
  );
}

async function TreatmentSection({ from, to }: { from: string; to: string }) {
  const t = await fetchTreatmentAttach(from, to);
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Lentes — Progressivos e Tratamentos</h3>
      <p className="text-xs text-text-muted mb-4">Qualidade/mix das lentes oftálmicas vendidas (alavanca de margem).</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <KpiCard data={{ label: "Lentes Vendidas", value: t.total_lenses, unit: "" }} />
        <KpiCard data={{ label: "Progressivos", value: t.progressive, unit: "" }} />
        <KpiCard data={{ label: "% Progressivos", value: t.progressive_pct, unit: "%" }} />
        <KpiCard data={{ label: "% c/ Tratamento", value: t.treatment_pct, unit: "%" }} />
      </div>
      <DataTable
        data={t.byTreatment.map((x, i) => ({ ...x, id: String(i) }))}
        keyField="id"
        maxHeight="max-h-72"
        columns={[
          { key: "label", label: "Tratamento / Acabamento" },
          { key: "count", label: "Nº Lentes", sortable: true, render: r => <span className="text-text-secondary">{r.count}</span> },
        ]}
      />
    </div>
  );
}

async function CrossSellSection({ from, to }: { from: string; to: string }) {
  const rows = await fetchCrossSell(from, to);
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Cross-sell — Oportunidades de 2º par (graduado sem sol)</h3>
      <CrossSellTable rows={rows} />
    </div>
  );
}

async function SecondPairSection({ from, to }: { from: string; to: string }) {
  const rows = await fetchSecondPairSales(from, to);
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Vendas com 2º par — graduado + óculos de sol</h3>
      <p className="text-xs text-text-muted mb-3">{rows.length} venda(s) com 2º par no período (o resultado, não a oportunidade).</p>
      <CrossSellTable rows={rows} />
    </div>
  );
}

export default async function VendasPage() {
  const session = await requireModule("vendas");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const prev = resolvePreviousRange(filters);
  const canExportVendas = canExport(session.permissions, "vendas");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Vendas" subtitle="Análise detalhada por categoria e colaborador" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Suspense fallback={<GlobalFilters compact value={filters} />}>
            <FiltersBar value={filters} />
          </Suspense>
          {canExportVendas && <MonthlyReportButton />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Suspense fallback={<>{Array.from({ length: 3 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <FastKpis from={from} to={to} prevFrom={prev.from} prevTo={prev.to} prevLabel={prev.label} />
          </Suspense>
          <Suspense fallback={<>{Array.from({ length: 2 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <MarginKpis from={from} to={to} prevFrom={prev.from} prevTo={prev.to} prevLabel={prev.label} />
          </Suspense>
        </div>

        <Suspense fallback={<BoxFallback msg="A carregar categorias…" />}>
          <CategorySection from={from} to={to} category={filters.category} />
        </Suspense>

        <Suspense fallback={<BoxFallback msg="A carregar marcas…" />}>
          <BrandsSection from={from} to={to} />
        </Suspense>

        <Suspense fallback={<BoxFallback msg="A carregar colaboradores…" />}>
          <EmployeeSection from={from} to={to} employee={filters.employee} canExportVendas={canExportVendas} />
        </Suspense>

        <Suspense fallback={<BoxFallback msg="A analisar tratamentos…" />}>
          <TreatmentSection from={from} to={to} />
        </Suspense>

        <Suspense fallback={<BoxFallback msg="A procurar oportunidades de cross-sell…" />}>
          <CrossSellSection from={from} to={to} />
        </Suspense>

        <Suspense fallback={<BoxFallback msg="A procurar vendas com 2º par…" />}>
          <SecondPairSection from={from} to={to} />
        </Suspense>
      </div>
    </div>
  );
}
