import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { AlertPanel } from "@/components/alerts/AlertPanel";
import { KpiCard } from "@/components/kpi/KpiCard";
import { fetchAlerts } from "@/lib/api/adapter";
import { SendAlertsButton } from "./SendAlertsButton";

export default async function AlertasPage() {
  await requireModule("alertas");
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Alertas" subtitle="Centro de notificações e ações urgentes" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <SendAlertsButton />
        </div>
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A calcular alertas…</div>}>
          <AlertasContent />
        </Suspense>
      </div>
    </div>
  );
}

async function AlertasContent() {
  const alerts = await fetchAlerts();
  const critical = alerts.filter(a => a.severity === "critical");
  const warnings = alerts.filter(a => a.severity === "warning");
  const infos = alerts.filter(a => a.severity === "info");
  const unread = alerts.filter(a => !a.is_read);

  return (
    <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Total Alertas", value: alerts.length, unit: "" }} />
          <KpiCard data={{ label: "Críticos", value: critical.length, unit: "" }} />
          <KpiCard data={{ label: "Avisos", value: warnings.length, unit: "" }} />
          <KpiCard data={{ label: "Por Ler", value: unread.length, unit: "" }} />
        </div>

        {critical.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#ef4444] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
              Alertas Críticos
            </h2>
            <AlertPanel alerts={critical} maxItems={20} />
          </div>
        )}

        {warnings.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#f59e0b] mb-3">Avisos</h2>
            <AlertPanel alerts={warnings} maxItems={20} />
          </div>
        )}

        {infos.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#3b82f6] mb-3">Informações</h2>
            <AlertPanel alerts={infos} maxItems={20} />
          </div>
        )}
    </>
  );
}
