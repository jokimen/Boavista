import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { DataTable } from "@/components/tables/DataTable";
import { parseFilters, resolveDateRange } from "@/lib/filters/range";
import { caixaSummary, isOdataConfigured } from "@/lib/api/odata-map";
import { formatCurrency } from "@/lib/utils";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { CaixaByDay } from "./CaixaByDay";

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("caixa");
  const filters = parseFilters(await searchParams);
  const { from, to } = resolveDateRange(filters);

  if (!isOdataConfigured()) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Gestão de Caixa" subtitle="Pagamentos recebidos" />
        <div className="p-6 text-sm text-text-secondary">OData não configurado (ODATA_URL/USER/PASSWORD).</div>
      </div>
    );
  }

  const caixa = await caixaSummary(from, to);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Gestão de Caixa" subtitle="Pagamentos recebidos por período" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <GlobalFilters compact />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Total Recebido", value: caixa.total, unit: "€" }} />
          <KpiCard data={{ label: "Nº Movimentos", value: caixa.count, unit: "" }} />
          <KpiCard data={{ label: "Formas de Pagamento", value: caixa.byMethod.length, unit: "" }} />
          <KpiCard data={{ label: "Colaboradores", value: caixa.byUser.length, unit: "" }} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Por Forma de Pagamento</h3>
            <DataTable
              data={caixa.byMethod.map((m, i) => ({ id: String(i), ...m }))}
              keyField="id"
              columns={[
                { key: "label", label: "Forma de Pagamento" },
                { key: "count", label: "Nº", render: r => <span className="text-text-secondary">{r.count}</span> },
                { key: "total", label: "Total", render: r => <span className="font-medium text-[#10b981]">{formatCurrency(r.total)}</span> },
              ]}
            />
          </div>
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Por Colaborador</h3>
            <DataTable
              data={caixa.byUser.map((m, i) => ({ id: String(i), ...m }))}
              keyField="id"
              columns={[
                { key: "label", label: "Colaborador" },
                { key: "count", label: "Nº", render: r => <span className="text-text-secondary">{r.count}</span> },
                { key: "total", label: "Total", render: r => <span className="font-medium text-[#10b981]">{formatCurrency(r.total)}</span> },
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <div className="flex items-center gap-1.5 mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Recebido por Dia</h3>
            <ChartInfo id="caixa-por-dia" />
          </div>
          <CaixaByDay days={caixa.byDay} />
        </div>
      </div>
    </div>
  );
}
