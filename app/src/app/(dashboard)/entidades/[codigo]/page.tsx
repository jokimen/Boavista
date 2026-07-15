import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { insurerEntityDetail } from "@/lib/api/visual-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { getAseguradoraConfig, type AseguradoraConfig } from "@/lib/aseguradoras/store";
import { formatCurrency, formatPercent } from "@/lib/utils";

async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

function BoxFallback({ msg }: { msg: string }) {
  return <div className="rounded-xl bg-bg-card border border-border p-6 text-sm text-text-secondary">{msg}</div>;
}

async function Detalhe({ codigo, from, to }: { codigo: string; from: string; to: string }) {
  const config = await getAseguradoraConfig().catch(() => ({}));
  const names: Record<string, string> = {};
  for (const [cod, row] of Object.entries(config)) names[cod] = row.nome;
  const d = await insurerEntityDetail(from, to, codigo, names).catch(() => null);
  if (!d) return <BoxFallback msg="Sem vendas desta entidade no período selecionado." />;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard data={{ label: "Nº de Vendas", value: d.vendas, unit: "" }} />
        <KpiCard data={{ label: "Valor Total", value: Math.round(d.total), unit: "€" }} />
        <KpiCard data={{ label: "Ticket Médio", value: Math.round(d.ticket), unit: "€" }} />
        <KpiCard data={{ label: "Comparticipação", value: Math.round(d.comparticipacao), unit: "€" }} />
      </div>

      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          Margem das vendas
          <ChartInfo id="entidades-margem" />
        </h3>
        <div className="flex items-baseline gap-6 mt-3">
          <span className="text-3xl font-semibold text-[#10b981]">{formatPercent(d.margemPct, 1)}</span>
          <span className="text-xs text-text-muted">
            calculada sobre {formatPercent(d.cobertura, 0)} do valor (só artigos de stock — as lentes não têm custo na fatura)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Produtos mais vendidos</h3>
          <DataTable
            data={d.produtos.map((p, i) => ({ ...p, id: `${i}` }))}
            keyField="id"
            columns={[
              { key: "desc", label: "Produto" },
              { key: "qty", label: "Un.", render: (r) => <span className="text-text-secondary">{r.qty}</span> },
              { key: "valor", label: "Valor", render: (r) => <span className="font-medium">{formatCurrency(r.valor)}</span> },
            ]}
          />
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Vendedores</h3>
          <DataTable
            data={d.vendedores.map((v) => ({ ...v, id: v.name }))}
            keyField="id"
            columns={[
              { key: "name", label: "Vendedor" },
              { key: "vendas", label: "Vendas", render: (r) => <span className="text-text-secondary">{r.vendas}</span> },
              { key: "valor", label: "Valor", render: (r) => <span className="font-medium">{formatCurrency(r.valor)}</span> },
            ]}
          />
        </div>
      </div>
    </>
  );
}

export default async function EntidadeDetailPage({ params }: { params: Promise<{ codigo: string }> }) {
  await requireModule("entidades");
  const { codigo } = await params;
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const cod = decodeURIComponent(codigo);
  const config = await getAseguradoraConfig().catch(() => ({} as AseguradoraConfig));
  const titulo = config[cod]?.nome?.trim() || `Seguro ${cod}`;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title={titulo} backHref="/entidades" />
      <div className="p-6 space-y-6">
        <Suspense fallback={<div className="h-10" />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<BoxFallback msg="A carregar detalhe da entidade…" />}>
          <Detalhe codigo={cod} from={from} to={to} />
        </Suspense>
      </div>
    </div>
  );
}
