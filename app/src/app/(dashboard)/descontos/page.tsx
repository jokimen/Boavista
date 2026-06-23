import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { ExportData } from "@/components/tables/ExportData";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { canExport } from "@/lib/auth/permissions";
import { fetchDiscounts } from "@/lib/api/adapter";
import { insurerDiscounts } from "@/lib/api/visual-map";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";
import { LowMarginTable } from "./LowMarginTable";
import { formatCurrency, formatPercent } from "@/lib/utils";

// Descontos em vendas COM SEGURO (comparticipação média por seguradora). Vai à REST
// FacturasClientes — em Suspense para não atrasar o resto da página.
async function SeguroDiscountsSection({ from, to }: { from: string; to: string }) {
  let seguros: Awaited<ReturnType<typeof insurerDiscounts>> = [];
  try {
    const aseg = await getAseguradoraConfig();
    const names: Record<string, string> = {};
    for (const [codigo, row] of Object.entries(aseg)) if (row.nome) names[codigo] = row.nome;
    seguros = await insurerDiscounts(from, to, names);
  } catch {
    seguros = [];
  }
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Descontos em Vendas com Seguro</h3>
        <ChartInfo id="fat-seguros-desc" />
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

export default async function DescontosPage() {
  const session = await requireModule("descontos");
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const to = now.toISOString().split("T")[0];
  const data = await fetchDiscounts(from, to);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Descontos e Margem" subtitle="Análise de descontos e impacto na rentabilidade" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <ExportData
            title="Descontos por colaborador"
            canExport={canExport(session.permissions, "descontos")}
            columns={[
              { key: "name", label: "Colaborador" },
              { key: "discount_total", label: "Total Descontos" },
              { key: "discount_avg_pct", label: "Desc. Médio %" },
            ]}
            rows={data.by_employee}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Descontos Hoje", value: data.total_discount_day, unit: "€" }} />
          <KpiCard data={{ label: "Descontos Mês", value: data.total_discount_month, unit: "€" }} />
          <KpiCard data={{ label: "Desconto Médio", value: data.avg_discount_pct, unit: "%" }} />
          <KpiCard data={{ label: "Vendas Baixa Margem", value: data.below_min_margin.length, unit: "" }} />
        </div>

        {data.below_min_margin.length > 0 && (
          <div className="rounded-xl bg-danger-bg/20 border border-[#ef4444]/30 p-4">
            <h3 className="text-sm font-semibold text-[#ef4444] mb-3">
              Vendas abaixo da margem mínima (50%)
            </h3>
            <LowMarginTable rows={data.below_min_margin} />
          </div>
        )}

        <Suspense fallback={<div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted">A carregar descontos por seguradora…</div>}>
          <SeguroDiscountsSection from={from} to={to} />
        </Suspense>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Descontos por Colaborador</h3>
            <DataTable
              data={data.by_employee}
              keyField="name"
              columns={[
                { key: "name", label: "Colaborador" },
                { key: "discount_total", label: "Total Desc.", sortable: true, render: r => formatCurrency(r.discount_total) },
                {
                  key: "discount_avg_pct", label: "Desc. Médio", sortable: true,
                  render: r => (
                    <div className="flex items-center gap-2">
                      <span className={r.discount_avg_pct > 8 ? "text-[#ef4444] font-semibold" : ""}>{formatPercent(r.discount_avg_pct)}</span>
                      {r.discount_avg_pct > 8 && <Badge variant="danger">Alto</Badge>}
                    </div>
                  )
                },
              ]}
            />
          </div>

          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Descontos por Categoria</h3>
            <DataTable
              data={data.by_category}
              keyField="category"
              columns={[
                { key: "label", label: "Categoria" },
                { key: "discount_total", label: "Total Desc.", sortable: true, render: r => formatCurrency(r.discount_total) },
                { key: "discount_avg_pct", label: "Desc. Médio", sortable: true, render: r => formatPercent(r.discount_avg_pct) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
