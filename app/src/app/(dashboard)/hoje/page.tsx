import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { AlertPanel } from "@/components/alerts/AlertPanel";
import { DataTable } from "@/components/tables/DataTable";
import { fetchAlerts, fetchSalesSummary, fetchAppointments } from "@/lib/api/adapter";
import { getRangeMetrics } from "@/lib/snapshots/daily";
import { getMonthlyTargets } from "@/lib/targets/store";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, marginIfCovered } from "@/lib/utils";

// Alertas críticos em secção própria (Suspense) — o motor de alertas é pesado
// (13 alertas sobre 2 meses, API serializada) e bloqueava o carregamento do Hoje.
async function AlertsSection() {
  let alerts: Awaited<ReturnType<typeof fetchAlerts>> = [];
  try {
    alerts = (await fetchAlerts()).filter((a) => a.severity === "critical");
  } catch {
    alerts = [];
  }
  return <AlertPanel alerts={alerts} maxItems={5} />;
}

/** Nº de dias úteis (seg–sáb) de um mês — ótica abre ao sábado. */
function workingDaysInMonth(year: number, month0: number): number {
  let n = 0;
  const days = new Date(year, month0 + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month0, d).getDay();
    if (dow !== 0) n++; // exclui domingos
  }
  return n;
}

export default async function HojePage() {
  await requireModule("hoje");
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  // Vendas de hoje/ontem: agregados diários do Firestore (instantâneo); fallback ao
  // vivo se o snapshot ainda não cobrir o dia. As consultas (agenda) não têm snapshot.
  const [rToday, rYesterday] = await Promise.all([
    getRangeMetrics(startToday.toISOString(), startTomorrow.toISOString()).catch(() => null),
    getRangeMetrics(startYesterday.toISOString(), startToday.toISOString()).catch(() => null),
  ]);
  const [summary, yesterday, appointments, targets] = await Promise.all([
    rToday?.summary ?? fetchSalesSummary(startToday.toISOString(), startTomorrow.toISOString()),
    rYesterday?.summary ?? fetchSalesSummary(startYesterday.toISOString(), startToday.toISOString()),
    fetchAppointments(todayStr, todayStr),
    getMonthlyTargets(now.getFullYear(), now.getMonth() + 1),
  ]);

  // Objetivo diário = objetivo GLOBAL do mês (Admin → Objetivos) ÷ dias úteis do mês.
  // Sem objetivo global definido → "Sem objetivo" (não inventa nem mostra valores
  // enganadores). NOTA: se aparecer um valor estranho (ex.: 1€), é porque o objetivo
  // global desse mês está mal preenchido no Admin → Objetivos.
  const monthlyTarget = targets.global ?? 0;
  const hasTarget = monthlyTarget > 0;
  const dayTarget = hasTarget ? Math.round(monthlyTarget / workingDaysInMonth(now.getFullYear(), now.getMonth())) : 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const salesChange = yesterday.total_sales > 0
    ? r1(((summary.total_sales - yesterday.total_sales) / yesterday.total_sales) * 100) : 0;

  const todayKpis = [
    { label: "Vendas do Dia", value: summary.total_sales, unit: "€" as const, change: salesChange, changePeriod: "ontem" },
    hasTarget
      ? { label: "Objetivo do Dia", value: dayTarget, unit: "€" as const, target: dayTarget, targetPct: dayTarget > 0 ? r1((summary.total_sales / dayTarget) * 100) : 0, infoId: "hoje-objetivo" }
      : { label: "Objetivo do Dia", value: "Sem objetivo", unit: "" as const, infoId: "hoje-objetivo" },
    marginIfCovered(summary.margin_pct, summary.cobertura_pct) !== null
      ? { label: "Margem do Dia", value: summary.margin_pct, unit: "%" as const, infoId: "kpi-margem-cobertura" }
      : { label: "Margem do Dia", value: "—", unit: "" as const, infoId: "kpi-margem-cobertura" },
    { label: "Encomendas Novas", value: summary.num_sales, unit: "" as const },
    { label: "Consultas Hoje", value: appointments.length, unit: "" as const },
    { label: "Ticket Médio", value: summary.avg_ticket, unit: "€" as const },
  ];

  const statusLabels: Record<string, string> = {
    marcada: "Marcada", realizada: "Realizada", falta: "Falta", cancelada: "Cancelada",
  };
  const statusVariants: Record<string, "success" | "info" | "danger" | "warning"> = {
    marcada: "info", realizada: "success", falta: "danger", cancelada: "warning",
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Hoje" subtitle={new Date().toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {todayKpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Consultas e Entregas do Dia</h3>
            <DataTable
              data={appointments}
              keyField="id"
              columns={[
                {
                  key: "date", label: "Hora", render: row =>
                    <span className="text-text-secondary">{new Date(row.date).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>
                },
                { key: "client_name", label: "Cliente" },
                { key: "type", label: "Tipo", render: row => <span className="capitalize">{row.type}</span> },
                { key: "employee_name", label: "Colaborador" },
                {
                  key: "status", label: "Estado",
                  render: row => <Badge variant={statusVariants[row.status]}>{statusLabels[row.status]}</Badge>
                },
                {
                  key: "converted_to_sale", label: "Venda",
                  render: row => row.converted_to_sale
                    ? <span className="text-[#10b981] font-medium">{formatCurrency(row.sale_amount ?? 0)}</span>
                    : <span className="text-text-muted">—</span>
                },
              ]}
            />
          </div>
          <Suspense fallback={<div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted h-[260px] flex items-center justify-center">A calcular alertas…</div>}>
            <AlertsSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
