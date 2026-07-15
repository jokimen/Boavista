import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportData } from "@/components/tables/ExportData";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { canExport } from "@/lib/auth/permissions";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { insurerEntities } from "@/lib/api/visual-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";
import { formatCurrency } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters employees={employees} value={value} />;
}

function BoxFallback({ msg }: { msg: string }) {
  return <div className="rounded-xl bg-bg-card border border-border p-6 text-sm text-text-secondary">{msg}</div>;
}

/** Vendas com seguro, por entidade. Pesado (faturas + linhas) → em Suspense. */
async function Entidades({ from, to, podeExportar }: { from: string; to: string; podeExportar: boolean }) {
  const config = await getAseguradoraConfig().catch(() => ({}));
  const names: Record<string, string> = {};
  for (const [cod, row] of Object.entries(config)) if (row.ativo !== false) names[cod] = row.nome;
  const rows = await insurerEntities(from, to, names).catch(() => []);

  if (!rows.length) return <BoxFallback msg="Sem vendas com seguro no período selecionado." />;

  const totVendas = rows.reduce((s, r) => s + r.vendas, 0);
  const totValor = rows.reduce((s, r) => s + r.total, 0);
  const totComp = rows.reduce((s, r) => s + r.comparticipacao, 0);
  const porRotular = rows.filter((r) => !names[r.codigo]?.trim()).length;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard data={{ label: "Vendas com Seguro", value: totVendas, unit: "" }} />
        <KpiCard data={{ label: "Valor Total", value: Math.round(totValor), unit: "€" }} />
        <KpiCard data={{ label: "Comparticipação", value: Math.round(totComp), unit: "€" }} />
        <KpiCard data={{ label: "Entidades", value: rows.length, unit: "" }} />
      </div>

      {porRotular > 0 && (
        <div className="rounded-xl bg-warning-bg border border-border p-3 text-xs text-text-secondary">
          {porRotular} entidade(s) ainda sem nome — o Visual só dá o código da seguradora.
          Dá-lhes nome em <Link href="/admin/seguradoras" className="text-[#3b82f6] hover:underline">Admin → Seguradoras</Link>.
        </div>
      )}

      <div className="rounded-xl bg-bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            Vendas por Entidade
            <ChartInfo id="entidades-vendas" />
          </h3>
          <ExportData
            title="Vendas por entidade"
            canExport={podeExportar}
            columns={[
              { key: "name", label: "Entidade" },
              { key: "vendas", label: "Nº Vendas" },
              { key: "total", label: "Valor Total" },
              { key: "descMedio", label: "Desconto Médio" },
              { key: "comparticipacao", label: "Comparticipação" },
            ]}
            rows={rows}
          />
        </div>
        <p className="text-xs text-text-muted mb-4">Clica numa entidade para ver ticket médio, produtos, margem e vendedores.</p>
        <DataTable
          data={rows.map((r) => ({ ...r, id: r.codigo }))}
          keyField="id"
          columns={[
            {
              key: "name", label: "Entidade",
              render: (r) => (
                <Link href={`/entidades/${encodeURIComponent(r.codigo)}`} className="text-[#3b82f6] hover:underline font-medium">
                  {r.name}
                </Link>
              ),
            },
            { key: "vendas", label: "Nº Vendas", render: (r) => <span className="text-text-secondary">{r.vendas}</span> },
            { key: "total", label: "Valor Total", render: (r) => <span className="font-medium">{formatCurrency(r.total)}</span> },
            { key: "descMedio", label: "Desconto Médio", render: (r) => <span className="text-text-secondary">{formatCurrency(r.descMedio)}</span> },
            { key: "comparticipacao", label: "Comparticipação", render: (r) => <span className="text-[#10b981]">{formatCurrency(r.comparticipacao)}</span> },
          ]}
        />
      </div>
    </>
  );
}

export default async function EntidadesPage() {
  const session = await requireModule("entidades");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const podeExportar = canExport(session.permissions, "entidades");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Entidades" />
      <div className="p-6 space-y-6">
        <Suspense fallback={<div className="h-10" />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<BoxFallback msg="A carregar vendas com seguro…" />}>
          <Entidades from={from} to={to} podeExportar={podeExportar} />
        </Suspense>
      </div>
    </div>
  );
}
