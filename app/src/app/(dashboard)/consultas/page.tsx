import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { fetchAppointments, fetchEmployees } from "@/lib/api/adapter";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { resolveDateRange, PERIOD_LABELS, type DashboardFilters } from "@/lib/filters/range";
import { formatCurrency, formatPercent } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

type Appointment = Awaited<ReturnType<typeof fetchAppointments>>[number];

const statusVariants: Record<string, "success" | "info" | "danger" | "warning" | "outline"> = {
  marcada: "info", realizada: "success", falta: "danger", cancelada: "warning",
};
const statusLabels: Record<string, string> = {
  marcada: "Marcada", realizada: "Realizada", falta: "Falta", cancelada: "Cancelada",
};

/** KPIs e ocupação por profissional a partir de uma lista de consultas. */
function summarize(appointments: Appointment[]) {
  const realized = appointments.filter(a => a.status === "realizada");
  const noShows = appointments.filter(a => a.status === "falta");
  const converted = appointments.filter(a => a.converted_to_sale);
  const conversionRate = realized.length > 0 ? (converted.length / realized.length) * 100 : 0;
  const avgRevenue = converted.length > 0
    ? converted.reduce((s, a) => s + (a.sale_amount ?? 0), 0) / converted.length : 0;
  const ocupacao = Object.values(
    appointments.reduce<Record<string, { name: string; total: number; realized: number; converted: number }>>((acc, a) => {
      const k = a.employee_name || "—";
      acc[k] ??= { name: k, total: 0, realized: 0, converted: 0 };
      acc[k].total += 1;
      if (a.status === "realizada") acc[k].realized += 1;
      if (a.converted_to_sale) acc[k].converted += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);
  return { realized, noShows, converted, conversionRate, avgRevenue, ocupacao };
}

function KpiRow({ appointments, scope }: { appointments: Appointment[]; scope: "dia" | "mes" }) {
  const s = summarize(appointments);
  const labelTotal = scope === "dia" ? "Marcadas Hoje" : "Consultas no Mês";
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <KpiCard data={{ label: labelTotal, value: appointments.length, unit: "" }} />
      <KpiCard data={{ label: "Realizadas", value: s.realized.length, unit: "" }} />
      <KpiCard data={{ label: "Faltas / No-Show", value: s.noShows.length, unit: "" }} />
      <KpiCard data={{ label: "Tx. Conversão", value: s.conversionRate, unit: "%" }} />
      <KpiCard data={{ label: "Receita Média", value: s.avgRevenue, unit: "€" }} />
    </div>
  );
}

function OcupacaoTable({ appointments }: { appointments: Appointment[] }) {
  const { ocupacao } = summarize(appointments);
  return (
    <DataTable
      data={ocupacao}
      keyField="name"
      emptyMessage="Sem consultas no período."
      columns={[
        { key: "name", label: "Profissional" },
        { key: "total", label: "Total", sortable: true },
        { key: "realized", label: "Realizadas", sortable: true },
        { key: "converted", label: "Conv. Venda", sortable: true },
        {
          key: "conv_rate", label: "Tx. Conv.",
          render: r => <span className="text-[#3b82f6] font-medium">{r.realized > 0 ? formatPercent((r.converted / r.realized) * 100, 0) : "—"}</span>
        },
      ]}
    />
  );
}

/** Vista DIÁRIA: agenda do dia + sem-compra + ocupação. */
async function DiaSection() {
  const today = new Date().toISOString().split("T")[0];
  const appointments = await fetchAppointments(today, today);
  return (
    <div className="space-y-6">
      <KpiRow appointments={appointments} scope="dia" />
      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Agenda do Dia</h3>
        <DataTable
          data={appointments}
          keyField="id"
          emptyMessage="Sem consultas hoje."
          columns={[
            { key: "date", label: "Hora", render: r => <span className="font-mono text-text-secondary">{new Date(r.date).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span> },
            { key: "client_name", label: "Cliente" },
            { key: "type", label: "Tipo", render: r => <span className="capitalize">{r.type}</span> },
            { key: "employee_name", label: "Profissional" },
            { key: "status", label: "Estado", render: r => <Badge variant={statusVariants[r.status]}>{statusLabels[r.status]}</Badge> },
            { key: "converted_to_sale", label: "Venda", render: r => r.converted_to_sale
                ? <span className="text-[#10b981] font-semibold">{formatCurrency(r.sale_amount ?? 0)}</span>
                : <span className="text-text-muted">—</span> },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Clientes com Consulta Sem Compra (hoje)</h3>
          <DataTable
            data={appointments.filter(a => a.status === "realizada" && !a.converted_to_sale)}
            keyField="id"
            emptyMessage="Sem consultas sem venda hoje."
            columns={[
              { key: "client_name", label: "Cliente" },
              { key: "employee_name", label: "Profissional" },
              { key: "date", label: "Hora", render: r => new Date(r.date).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) },
            ]}
          />
        </div>
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Ocupação por Profissional (hoje)</h3>
          <OcupacaoTable appointments={appointments} />
        </div>
      </div>
    </div>
  );
}

/** Vista do PERÍODO (filtro global): KPIs + ocupação por profissional no intervalo. */
async function PeriodoSection({ from, to, label }: { from: string; to: string; label: string }) {
  const appointments = await fetchAppointments(from, to);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Período</h2>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <KpiRow appointments={appointments} scope="mes" />
      <div className="rounded-xl bg-bg-card border border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Ocupação por Profissional (período)</h3>
        <OcupacaoTable appointments={appointments} />
      </div>
    </div>
  );
}

export default async function ConsultasPage() {
  await requireModule("consultas");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);
  const label = filters.period === "custom" && filters.from && filters.to
    ? `${filters.from} a ${filters.to}`
    : PERIOD_LABELS[filters.period];
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Consultas e Agenda" subtitle="Gestão de consultas e conversões" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-8">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar consultas de hoje…</div>}>
          <DiaSection />
        </Suspense>
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar resumo do período…</div>}>
          <PeriodoSection from={from} to={to} label={label} />
        </Suspense>
      </div>
    </div>
  );
}
