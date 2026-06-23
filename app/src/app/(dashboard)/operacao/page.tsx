import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { fetchOrders } from "@/lib/api/adapter";
import { formatCurrency } from "@/lib/utils";

export default async function OperacaoPage() {
  await requireModule("operacao");
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Operação" subtitle="Encomendas em curso, atrasos e entregas" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar encomendas…</div>}>
          <OperacaoContent />
        </Suspense>
      </div>
    </div>
  );
}

async function OperacaoContent() {
  const orders = await fetchOrders();

  const inProduction = orders.filter(o => o.status === "em_producao");
  const readyToDeliver = orders.filter(o => o.status === "pronta_entrega");
  const overdue = orders.filter(o => o.is_overdue);
  const overdueDelivery = orders.filter(o => o.status === "pronta_entrega" && o.days_in_status >= 15);

  return (
    <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Em Produção", value: inProduction.length, unit: "" }} />
          <KpiCard data={{ label: "Prontas Entrega", value: readyToDeliver.length, unit: "" }} />
          <KpiCard data={{ label: "Encomendas Atrasadas", value: overdue.length, unit: "" }} />
          <KpiCard data={{ label: "Espera +15 dias", value: overdueDelivery.length, unit: "" }} />
        </div>

        {overdueDelivery.length > 0 && (
          <div className="rounded-xl bg-danger-bg/20 border border-[#ef4444]/30 p-4">
            <h3 className="text-sm font-semibold text-[#ef4444] mb-3">
              ⚠️ Vendas prontas a entregar há mais de 15 dias — contactar clientes urgente
            </h3>
            <DataTable
              data={overdueDelivery}
              keyField="id"
              maxHeight="max-h-80"
              columns={[
                { key: "client_name", label: "Cliente" },
                { key: "amount", label: "Valor", render: r => formatCurrency(r.amount) },
                { key: "days_in_status", label: "Dias Pronta", render: r => <span className="text-[#ef4444] font-bold">{r.days_in_status}d</span> },
                { key: "expected_delivery", label: "Prev. Entrega", render: r => r.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString("pt-PT") : "—" },
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Encomendas em Produção</h3>
            <DataTable
              data={inProduction}
              keyField="id"
              maxHeight="max-h-80"
              emptyMessage="Sem encomendas em produção."
              columns={[
                { key: "client_name", label: "Cliente" },
                { key: "amount", label: "Valor", render: r => formatCurrency(r.amount) },
                {
                  key: "is_overdue", label: "Estado",
                  render: r => <Badge variant={r.is_overdue ? "danger" : "info"}>{r.is_overdue ? "Atrasada" : "No prazo"}</Badge>
                },
                { key: "days_in_status", label: "Dias em Prod.", render: r => `${r.days_in_status}d` },
                { key: "expected_delivery", label: "Prev. Entrega", render: r => r.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString("pt-PT") : "—" },
              ]}
            />
          </div>

          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Prontas para Entrega</h3>
            <DataTable
              data={readyToDeliver}
              keyField="id"
              maxHeight="max-h-80"
              emptyMessage="Sem encomendas prontas."
              columns={[
                { key: "client_name", label: "Cliente" },
                { key: "amount", label: "Valor", render: r => formatCurrency(r.amount) },
                {
                  key: "days_in_status", label: "Espera",
                  render: r => <span className={r.days_in_status >= 15 ? "text-[#ef4444] font-bold" : r.days_in_status >= 7 ? "text-[#f59e0b]" : ""}>{r.days_in_status}d</span>
                },
                { key: "expected_delivery", label: "Prev. Entrega", render: r => r.expected_delivery ? new Date(r.expected_delivery).toLocaleDateString("pt-PT") : "—" },
              ]}
            />
          </div>
        </div>
    </>
  );
}
