import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { DataTable } from "@/components/tables/DataTable";
import { KpiCard } from "@/components/kpi/KpiCard";
import { Badge } from "@/components/ui/badge";
import { fetchPipeline, fetchOrders } from "@/lib/api/adapter";
import { formatCurrency } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  consulta_marcada: "Consulta Marcada",
  consulta_realizada: "Consulta Realizada",
  orcamento_emitido: "Orçamento Emitido",
  orcamento_aceite: "Orçamento Aceite",
  em_producao: "Em Produção",
  pronta_entrega: "Pronta p/ Entrega",
  entregue: "Entregue",
};

export default async function PipelinePage() {
  await requireModule("pipeline");
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Pipeline Comercial" subtitle="Funil de vendas e encomendas em curso" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar pipeline…</div>}>
          <PipelineContent />
        </Suspense>
      </div>
    </div>
  );
}

async function PipelineContent() {
  const [stages, orders] = await Promise.all([fetchPipeline(), fetchOrders()]);

  const overdue = orders.filter(o => o.is_overdue);
  const pendingQuotes = orders.filter(o => o.status === "orcamento_emitido" && o.days_in_status > 3);
  const readyToDeliver = orders.filter(o => o.status === "pronta_entrega");

  return (
    <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Em Produção", value: stages.find(s => s.status === "em_producao")?.count ?? 0, unit: "" }} />
          <KpiCard data={{ label: "Prontas Entrega", value: readyToDeliver.length, unit: "" }} />
          <KpiCard data={{ label: "Encomendas Atrasadas", value: overdue.length, unit: "" }} />
          <KpiCard data={{ label: "Orç. Pendentes +3d", value: pendingQuotes.length, unit: "" }} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Funil Comercial</h3>
              <ChartInfo id="pipeline-funnel" />
            </div>
            <FunnelChart stages={stages} />
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-text-muted">
                Taxa conversão consulta→venda:{" "}
                <span className="text-[#10b981] font-semibold">
                  {Math.round((stages[2].count / stages[0].count) * 100)}%
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">
              Encomendas Ativas
              {overdue.length > 0 && (
                <Badge variant="danger" className="ml-2">{overdue.length} atrasadas</Badge>
              )}
            </h3>
            <DataTable
              data={orders}
              keyField="id"
              columns={[
                { key: "client_name", label: "Cliente" },
                { key: "amount", label: "Valor", sortable: true, render: r => <span className="font-medium">{formatCurrency(r.amount)}</span> },
                {
                  key: "status", label: "Estado",
                  render: r => (
                    <Badge variant={
                      r.status === "entregue" ? "success" :
                      r.is_overdue ? "danger" :
                      r.status === "pronta_entrega" ? "warning" : "info"
                    }>
                      {statusLabels[r.status]}
                    </Badge>
                  )
                },
                { key: "days_in_status", label: "Dias", sortable: true, render: r => (
                  <span className={r.is_overdue ? "text-[#ef4444] font-semibold" : "text-text-secondary"}>
                    {r.days_in_status}d {r.is_overdue ? "⚠️" : ""}
                  </span>
                )},
                {
                  key: "expected_delivery", label: "Prev. Entrega",
                  render: r => r.expected_delivery
                    ? <span className={r.is_overdue ? "text-[#ef4444]" : "text-text-secondary"}>{new Date(r.expected_delivery).toLocaleDateString("pt-PT")}</span>
                    : <span className="text-text-muted">—</span>
                },
              ]}
              maxHeight="max-h-72"
            />
          </div>
        </div>

        {pendingQuotes.length > 0 && (
          <div className="rounded-xl bg-warning-bg/20 border border-[#f59e0b]/30 p-4">
            <h3 className="text-sm font-semibold text-[#f59e0b] mb-3">Orçamentos pendentes há mais de 3 dias — contactar clientes</h3>
            <DataTable
              data={pendingQuotes}
              keyField="id"
              maxHeight="max-h-80"
              columns={[
                { key: "client_name", label: "Cliente" },
                { key: "client_contact", label: "Contacto", render: r => r.client_contact
                  ? <a href={`tel:${r.client_contact}`} className="text-[#3b82f6] hover:underline">{r.client_contact}</a>
                  : <span className="text-text-muted">—</span> },
                { key: "amount", label: "Valor", render: r => formatCurrency(r.amount) },
                { key: "days_in_status", label: "Há quantos dias", render: r => <span className="text-[#f59e0b] font-medium">{r.days_in_status} dias</span> },
                { key: "created_at", label: "Data Orçamento", render: r => new Date(r.created_at).toLocaleDateString("pt-PT") },
              ]}
            />
          </div>
        )}
    </>
  );
}
