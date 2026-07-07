import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { AlertPanel } from "@/components/alerts/AlertPanel";
import { DataTable } from "@/components/tables/DataTable";
import { fetchAlerts, fetchSalesSummary, fetchSalesSummaryLight, fetchAppointments } from "@/lib/api/adapter";
import { getMonthlyTargets } from "@/lib/targets/store";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, marginIfCovered } from "@/lib/utils";

// Cartão KPI de placeholder (mantém o slot na grelha enquanto carrega).
function KpiSkeleton() {
  return <div className="rounded-xl bg-bg-card border border-border h-[92px] animate-pulse" />;
}
function KpiUnavailable() {
  return <div className="rounded-xl bg-bg-card border border-border h-[92px] flex items-center justify-center text-xs text-text-muted">—</div>;
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

// KPIs rápidos (REST leve): Vendas do Dia, Objetivo, Encomendas, Ticket. Sem OData
// (margem) → aparecem quase de imediato, sem esperar pela cadeia de custos.
async function FastKpis({ today, tomorrow, yesterday, year, month, month0 }: { today: string; tomorrow: string; yesterday: string; year: number; month: number; month0: number }) {
  let summary, prev, targets;
  try {
    [summary, prev, targets] = await Promise.all([
      fetchSalesSummaryLight(today, tomorrow),
      fetchSalesSummaryLight(yesterday, today),
      getMonthlyTargets(year, month),
    ]);
  } catch {
    return <>{Array.from({ length: 4 }).map((_, i) => <KpiUnavailable key={i} />)}</>;
  }
  const monthlyTarget = targets.global ?? 0;
  const hasTarget = monthlyTarget > 0;
  const dayTarget = hasTarget ? Math.round(monthlyTarget / workingDaysInMonth(year, month0)) : 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const salesChange = prev.total_sales > 0 ? r1(((summary.total_sales - prev.total_sales) / prev.total_sales) * 100) : 0;
  return (
    <>
      <KpiCard data={{ label: "Vendas do Dia", value: summary.total_sales, unit: "€", change: salesChange, changePeriod: "ontem" }} />
      <KpiCard data={hasTarget
        ? { label: "Objetivo do Dia", value: dayTarget, unit: "€", target: dayTarget, targetPct: dayTarget > 0 ? r1((summary.total_sales / dayTarget) * 100) : 0, infoId: "hoje-objetivo" }
        : { label: "Objetivo do Dia", value: "Sem objetivo", unit: "", infoId: "hoje-objetivo" }} />
      <KpiCard data={{ label: "Encomendas Novas", value: summary.num_sales, unit: "" }} />
      <KpiCard data={{ label: "Ticket Médio", value: summary.avg_ticket, unit: "€" }} />
    </>
  );
}

// Consultas do dia (OData/agenda) — só a contagem para o KPI. Suspense próprio.
async function ConsultasKpi({ todayStr }: { todayStr: string }) {
  let count = 0;
  try { count = (await fetchAppointments(todayStr, todayStr)).length; } catch { return <KpiUnavailable />; }
  return <KpiCard data={{ label: "Consultas Hoje", value: count, unit: "" }} />;
}

// Margem do dia — pesada (custos via OData). Suspense próprio para não bloquear.
async function MargemKpi({ today, tomorrow }: { today: string; tomorrow: string }) {
  let s;
  try { s = await fetchSalesSummary(today, tomorrow); } catch { return <KpiUnavailable />; }
  return (
    <KpiCard data={marginIfCovered(s.margin_pct, s.cobertura_pct) !== null
      ? { label: "Margem do Dia", value: s.margin_pct, unit: "%", infoId: "kpi-margem-cobertura" }
      : { label: "Margem do Dia", value: "—", unit: "", infoId: "kpi-margem-cobertura" }} />
  );
}

const statusLabels: Record<string, string> = { marcada: "Marcada", realizada: "Realizada", falta: "Falta", cancelada: "Cancelada" };
const statusVariants: Record<string, "success" | "info" | "danger" | "warning"> = { marcada: "info", realizada: "success", falta: "danger", cancelada: "warning" };

// Tabela de consultas/entregas do dia (OData/agenda). Suspense próprio.
async function AppointmentsTable({ todayStr }: { todayStr: string }) {
  let appointments: Awaited<ReturnType<typeof fetchAppointments>> = [];
  try { appointments = await fetchAppointments(todayStr, todayStr); } catch { appointments = []; }
  return (
    <DataTable
      data={appointments}
      keyField="id"
      columns={[
        { key: "date", label: "Hora", render: row => <span className="text-text-secondary">{new Date(row.date).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span> },
        { key: "client_name", label: "Cliente" },
        { key: "type", label: "Tipo", render: row => <span className="capitalize">{row.type}</span> },
        { key: "employee_name", label: "Colaborador" },
        { key: "status", label: "Estado", render: row => <Badge variant={statusVariants[row.status]}>{statusLabels[row.status]}</Badge> },
        { key: "converted_to_sale", label: "Venda", render: row => row.converted_to_sale
          ? <span className="text-[#10b981] font-medium">{formatCurrency(row.sale_amount ?? 0)}</span>
          : <span className="text-text-muted">—</span> },
      ]}
    />
  );
}

// Alertas críticos em secção própria (Suspense) — o motor de alertas é pesado
// (13 alertas sobre 2 meses, API serializada) e bloqueava o carregamento do Hoje.
async function AlertsSection() {
  let alerts: Awaited<ReturnType<typeof fetchAlerts>> = [];
  try { alerts = (await fetchAlerts()).filter((a) => a.severity === "critical"); } catch { alerts = []; }
  return <AlertPanel alerts={alerts} maxItems={5} />;
}

export default async function HojePage() {
  await requireModule("hoje");
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Hoje" subtitle={new Date().toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Suspense fallback={<>{Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}</>}>
            <FastKpis today={today} tomorrow={tomorrow} yesterday={yesterday} year={now.getFullYear()} month={now.getMonth() + 1} month0={now.getMonth()} />
          </Suspense>
          <Suspense fallback={<KpiSkeleton />}>
            <ConsultasKpi todayStr={todayStr} />
          </Suspense>
          <Suspense fallback={<KpiSkeleton />}>
            <MargemKpi today={today} tomorrow={tomorrow} />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Consultas e Entregas do Dia</h3>
            <Suspense fallback={<div className="text-xs text-text-muted h-[260px] flex items-center justify-center">A carregar consultas…</div>}>
              <AppointmentsTable todayStr={todayStr} />
            </Suspense>
          </div>
          <Suspense fallback={<div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted h-[260px] flex items-center justify-center">A calcular alertas…</div>}>
            <AlertsSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
