import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { DataTable } from "@/components/tables/DataTable";
import { SplitBars } from "@/components/charts/SplitBars";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { employeeAnalytics, type EmployeeAnalytics } from "@/lib/api/visual-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { canExport } from "@/lib/auth/permissions";
import { EmployeeExport } from "./EmployeeExport";
import { formatCurrency, formatDate } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

const delta = (cur: number, prev: number): number =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0;

export default async function VendedorDetailPage({
  params,
}: {
  params: Promise<{ vendedor: string }>;
}) {
  const session = await requireModule("equipa");
  const { vendedor } = await params;
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const allowExport = canExport(session.permissions, "equipa");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title={decodeURIComponent(vendedor)} subtitle="Análise do vendedor vs período homólogo (ano anterior)" backHref="/equipa" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar análise do vendedor…</div>}>
          <VendedorDetail usuario={decodeURIComponent(vendedor)} from={from} to={to} allowExport={allowExport} />
        </Suspense>
      </div>
    </div>
  );
}

function Card({ title, hint, info, children }: { title: string; hint?: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
        {title}
        {info && <ChartInfo id={info} size={13} />}
      </h3>
      {hint && <p className="text-xs text-text-muted mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

/** Caixa de estatística com valor atual e o homólogo do ano anterior em baixo. */
function Stat({ label, value, prev }: { label: string; value: string; prev: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated border border-border p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-xl font-bold text-text-primary">{value}</div>
      <div className="text-[11px] text-text-muted mt-0.5">ano ant.: {prev}</div>
    </div>
  );
}

async function VendedorDetail({ usuario, from, to, allowExport }: { usuario: string; from: string; to: string; allowExport: boolean }) {
  const { current: c, previous: p } = await employeeAnalytics(usuario, from, to);
  if (c.total_qty === 0 && c.num_ventas === 0) {
    return <p className="text-sm text-text-secondary py-8 text-center">Sem vendas deste vendedor no período selecionado.</p>;
  }
  const convRate = (a: EmployeeAnalytics) => (a.quotes_made > 0 ? Math.round((a.quotes_converted / a.quotes_made) * 100) : 0);
  const topSupplier = c.top_suppliers[0];
  const periodLabel = `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <EmployeeExport payload={{ name: usuario, periodLabel, current: c, previous: p }} canExport={allowExport} />
      </div>

      {/* KPIs com variação homóloga */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard data={{ label: "Vendas", value: Math.round(c.total_sales), unit: "€", change: delta(c.total_sales, p.total_sales), changePeriod: "ano anterior", infoId: "emp-vendas" }} />
        <KpiCard data={{ label: "ROI (margem €)", value: Math.round(c.margin_eur), unit: "€", change: delta(c.margin_eur, p.margin_eur), changePeriod: "ano anterior", infoId: "emp-roi" }} />
        <KpiCard data={{ label: "Ticket Médio", value: Math.round(c.avg_ticket), unit: "€", change: delta(c.avg_ticket, p.avg_ticket), changePeriod: "ano anterior", infoId: "kpi-ticket" }} />
        <KpiCard data={{ label: "Nº Vendas", value: c.num_ventas, unit: "", change: delta(c.num_ventas, p.num_ventas), changePeriod: "ano anterior", infoId: "kpi-num-vendas" }} />
        <KpiCard data={{ label: "Margem %", value: c.margin_pct, unit: "%", infoId: "kpi-margem-pct" }} />
        <KpiCard data={{ label: "Orç. convertidos", value: c.quotes_converted, unit: "", change: delta(c.quotes_converted, p.quotes_converted), changePeriod: "ano anterior", infoId: "emp-orcamentos" }} />
      </div>

      {/* Armações/Sol + Lentes + Orçamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Armações vs Óculos de Sol" info="emp-armacoes-sol">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`Armações (${c.frames_qty} un.)`} value={formatCurrency(c.frames_sales)} prev={`${formatCurrency(p.frames_sales)} · ${p.frames_qty} un.`} />
            <Stat label={`Sol (${c.sun_qty} un.)`} value={formatCurrency(c.sun_sales)} prev={`${formatCurrency(p.sun_sales)} · ${p.sun_qty} un.`} />
          </div>
        </Card>

        <Card title="Lentes Oftálmicas (unidades)" info="emp-lentes-tipo">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Monofocais" value={String(c.lens_mono)} prev={String(p.lens_mono)} />
            <Stat label="Progressivos" value={String(c.lens_prog)} prev={String(p.lens_prog)} />
            <Stat label="Bifocais" value={String(c.lens_bifo)} prev={String(p.lens_bifo)} />
          </div>
        </Card>

        <Card title="Orçamentos" info="emp-orcamentos">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Feitos" value={String(c.quotes_made)} prev={String(p.quotes_made)} />
            <Stat label="Convertidos" value={`${c.quotes_converted} (${convRate(c)}%)`} prev={`${p.quotes_converted} (${convRate(p)}%)`} />
          </div>
        </Card>
      </div>

      {/* Marcas + Fornecedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Marcas que mais vende" hint="Top marcas por unidades no período." info="emp-marcas">
          <DataTable
            data={c.top_brands.map((b, i) => ({ ...b, id: `${i}-${b.label}` }))}
            keyField="id"
            maxHeight="max-h-[360px]"
            emptyMessage="Sem dados."
            columns={[
              { key: "label", label: "Marca" },
              { key: "qty", label: "Un.", render: (r) => <span className="font-medium tabular-nums">{r.qty}</span> },
              { key: "sales", label: "Vendas", render: (r) => <span className="tabular-nums">{formatCurrency(r.sales)}</span> },
            ]}
          />
        </Card>

        <Card title="Peso por fornecedor" info="emp-fornecedores-peso" hint={topSupplier ? `Mais vendido: ${topSupplier.label} (${topSupplier.qty} un.).` : "Quanto pesa cada fornecedor nas vendas do período."}>
          <SplitBars items={c.top_suppliers.map((s) => ({ label: s.label, qty: s.qty, sales: s.sales, pct: s.pct }))} unit="eur" />
        </Card>
      </div>

      {/* Vendas por entregar */}
      <Card title={`Vendas por entregar (${c.pending.length})`} info="emp-por-entregar" hint="Linhas vendidas ainda não entregues ao cliente.">
        <DataTable
          data={c.pending.map((x, i) => ({ ...x, id: `${i}-${x.ref}` }))}
          keyField="id"
          maxHeight="max-h-[420px]"
          emptyMessage="Nada por entregar. 🎉"
          columns={[
            { key: "ref", label: "Venda" },
            { key: "date", label: "Data", render: (r) => <span className="text-text-secondary">{r.date ? formatDate(r.date) : "—"}</span> },
            { key: "desc", label: "Produto" },
            { key: "qty", label: "Un.", render: (r) => <span className="tabular-nums">{r.qty}</span> },
            { key: "estado", label: "Estado", render: (r) => <span className="text-[#f59e0b]">{r.estado}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
