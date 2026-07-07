import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { DataTable } from "@/components/tables/DataTable";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { invoices, isOdataConfigured } from "@/lib/api/odata-map";
import { insurerDiscounts } from "@/lib/api/visual-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";
import { formatCurrency } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

/** Agrupa por chave, devolvendo [{label, count}] ordenado por count desc. */
function countBy<T>(rows: T[], key: (r: T) => string): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** Série/tipo de documento = prefixo de letras da referência (ex.: "FS012026/.." → "FS"). */
const docSeries = (ref: string): string => (ref.match(/^[A-Za-z]+/)?.[0] ?? "—").toUpperCase();

const BoxFallback = ({ msg }: { msg: string }) => (
  <div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted h-[120px] flex items-center justify-center">{msg}</div>
);

// Faturas (OData VX_FACTURAS_CLIENTES) — rápido. KPIs + análises por dia/vendedor/série.
async function InvoicesSection({ from, to }: { from: string; to: string }) {
  const list = await invoices(from, to);
  const clientesFaturados = new Set(list.map((i) => i.codigo_venta ?? i.codigo)).size;
  const byDay = countBy(list, (i) => i.date.slice(0, 10));
  const byUser = countBy(list, (i) => i.usuario);
  const bySeries = countBy(list, (i) => docSeries(i.numero));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard data={{ label: "Faturas Emitidas", value: list.length, unit: "" }} />
        <KpiCard data={{ label: "Tipos de Documento", value: bySeries.length, unit: "" }} />
        <KpiCard data={{ label: "Vendas Faturadas", value: clientesFaturados, unit: "" }} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Faturas por Vendedor</h3>
          <DataTable data={byUser.map((m, i) => ({ id: String(i), ...m }))} keyField="id" maxHeight="max-h-72"
            columns={[{ key: "label", label: "Vendedor" }, { key: "count", label: "Nº Faturas", render: r => <span className="font-medium">{r.count}</span> }]} />
        </div>
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Por Tipo de Documento</h3>
          <DataTable data={bySeries.map((m, i) => ({ id: String(i), ...m }))} keyField="id" maxHeight="max-h-72"
            columns={[{ key: "label", label: "Série" }, { key: "count", label: "Nº Faturas", render: r => <span className="font-medium">{r.count}</span> }]} />
        </div>
      </div>

      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Faturas por Dia</h3>
        <DataTable data={byDay.map((m, i) => ({ id: String(i), ...m }))} keyField="id" maxHeight="max-h-72"
          columns={[
            { key: "label", label: "Dia", render: r => <span className="capitalize">{new Date(r.label).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" })}</span> },
            { key: "count", label: "Nº Faturas", render: r => <span className="font-medium">{r.count}</span> },
          ]} />
      </div>

      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Faturas Emitidas</h3>
        <DataTable data={list.map((inv) => ({ ...inv, id: inv.codigo }))} keyField="id" maxHeight="max-h-96"
          columns={[
            { key: "numero", label: "Nº Fatura" },
            { key: "date", label: "Data", render: r => <span className="text-text-secondary">{new Date(r.date).toLocaleDateString("pt-PT")}</span> },
            { key: "cliente", label: "Cliente" },
            { key: "nif", label: "NIF", render: r => <span className="text-text-muted">{r.nif || "—"}</span> },
            { key: "usuario", label: "Emitida por" },
            { key: "codigo_venta", label: "Venda", render: r => <span className="text-text-muted">{r.codigo_venta ?? "—"}</span> },
          ]} />
      </div>
    </>
  );
}

// Descontos por seguradora (REST FacturasClientes) — mais lento, Suspense próprio.
async function InsurerSection({ from, to }: { from: string; to: string }) {
  let seguros: Awaited<ReturnType<typeof insurerDiscounts>> = [];
  try {
    const aseg = await getAseguradoraConfig();
    const names: Record<string, string> = {};
    for (const [codigo, row] of Object.entries(aseg)) if (row.nome) names[codigo] = row.nome;
    seguros = await insurerDiscounts(from, to, names);
  } catch { seguros = []; }
  const eurComparticipado = seguros.reduce((s, x) => s + x.eurComparticipado, 0);
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-text-primary">Descontos por Seguradora</h3>
          <ChartInfo id="fat-seguros-desc" />
        </div>
        <span className="text-xs text-text-secondary">Comparticipado: <strong className="text-[#10b981]">{formatCurrency(eurComparticipado)}</strong></span>
      </div>
      {seguros.length ? (
        <DataTable
          data={seguros.map((s, i) => ({ id: String(i), ...s }))}
          keyField="id"
          maxHeight="max-h-80"
          columns={[
            { key: "name", label: "Seguradora" },
            { key: "clientes", label: "Clientes", render: r => <span className="text-text-secondary">{r.clientes}</span> },
            { key: "descMedioPct", label: "Desc. Médio", render: r => <span className="text-[#f59e0b] font-medium">{r.descMedioPct.toFixed(1)}%</span> },
            { key: "eurComparticipado", label: "€ Comparticipado", render: r => <span className="font-medium text-[#10b981]">{formatCurrency(r.eurComparticipado)}</span> },
          ]}
        />
      ) : (
        <p className="text-xs text-text-muted">Sem faturas de seguradoras mapeadas no período. Mapeia as seguradoras em <strong>Admin → Seguradoras</strong>.</p>
      )}
    </div>
  );
}

export default async function FaturacaoPage() {
  await requireModule("faturacao");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);

  if (!isOdataConfigured()) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Faturação" subtitle="Faturas emitidas" />
        <div className="p-6 text-sm text-text-secondary">OData não configurado (ODATA_URL/USER/PASSWORD).</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Faturação" subtitle="Faturas emitidas a clientes" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<BoxFallback msg="A carregar faturas…" />}>
          <InvoicesSection from={from} to={to} />
        </Suspense>
        <Suspense fallback={<BoxFallback msg="A carregar descontos por seguradora…" />}>
          <InsurerSection from={from} to={to} />
        </Suspense>
      </div>
    </div>
  );
}
