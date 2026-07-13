import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { EmployeeDrilldown } from "./EmployeeDrilldown";
import { WeeklyReportButton } from "./WeeklyReportButton";
import { Badge } from "@/components/ui/badge";
import { ExportData } from "@/components/tables/ExportData";
import { canExport } from "@/lib/auth/permissions";
import { fetchSalesByEmployee, fetchEmployees } from "@/lib/api/adapter";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { getEmployeeTargets } from "@/lib/targets/store";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { Permission } from "@/types";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

// Esqueleto enquanto os dados por vendedor (API Visual + margem via OData) chegam.
function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl bg-bg-card border border-border h-[92px] animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl bg-bg-card border border-border h-[220px] animate-pulse" />)}
      </div>
    </div>
  );
}

// Conteúdo pesado (vendas/margem por vendedor) — em Suspense para não bloquear a
// navegação: o cabeçalho e os filtros aparecem já, os cartões enchem a seguir.
async function TeamContent({ filters, permissions }: { filters: DashboardFilters; permissions: Permission[] }) {
  const { from, to } = resolveDateRange(filters);
  // Objetivo mensal referente ao MÊS do início do período selecionado.
  const targetMonth = new Date(from);
  const [rawEmployees, dbTargets] = await Promise.all([
    fetchSalesByEmployee(from, to),
    getEmployeeTargets(targetMonth.getFullYear(), targetMonth.getMonth() + 1).catch(() => ({} as Record<string, number>)),
  ]);
  // Objetivo por vendedor definido no Admin tem prioridade sobre o fallback (env).
  const employees = rawEmployees.map((e) => ({ ...e, target: dbTargets[e.employee_id] ?? e.target }));

  const topSeller = employees[0];
  const avgMargin = employees.length ? employees.reduce((s, e) => s + e.margin_pct, 0) / employees.length : 0;
  const avgDiscount = employees.length ? employees.reduce((s, e) => s + e.discount_avg, 0) / employees.length : 0;
  const totalConversions = employees.reduce((s, e) => s + e.quotes_converted, 0);
  const totalQuotes = employees.reduce((s, e) => s + e.quotes_issued, 0);

  return (
    <>
        <div className="flex justify-between items-center gap-3 flex-wrap">
          {canExport(permissions, "equipa") && <WeeklyReportButton />}
          <ExportData
            title="Equipa — desempenho"
            canExport={canExport(permissions, "equipa")}
            columns={[
              { key: "name", label: "Colaborador" },
              { key: "sales_month", label: "Vendas" },
              { key: "target", label: "Objetivo" },
              { key: "margin_pct", label: "Margem %" },
              { key: "avg_ticket", label: "Ticket Médio" },
              { key: "discount_avg", label: "Desc. Médio %" },
              { key: "quotes_issued", label: "Orçamentos" },
              { key: "quotes_converted", label: "Convertidos" },
              { key: "premium_sold", label: "Premium (>400€)" },
            ]}
            rows={employees}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Melhor Vendedor", value: topSeller?.name ?? "—", unit: "" }} />
          <KpiCard data={{ label: "Margem Média Equipa", value: avgMargin, unit: "%" }} />
          <KpiCard data={{ label: "Desconto Médio", value: avgDiscount, unit: "%" }} />
          <KpiCard data={{ label: "Conv. Orçamentos", value: `${totalConversions}/${totalQuotes}`, unit: "" }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {employees.map(emp => {
            const hasTarget = emp.target > 0;
            const targetPct = hasTarget ? (emp.sales_month / emp.target) * 100 : 0;
            return (
              <Link key={emp.employee_id} href={`/equipa/${encodeURIComponent(emp.employee_id)}`}
                className="block rounded-xl bg-bg-card border border-border p-4 hover:border-border-subtle hover:bg-bg-card-hover transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{emp.name[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{emp.name}</p>
                      {hasTarget ? (
                        <Badge variant={targetPct >= 100 ? "success" : targetPct >= 75 ? "warning" : "danger"}>
                          {formatPercent(targetPct, 0)} objetivo
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-muted">Sem objetivo</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Vendas</span>
                    <span className="font-medium text-text-primary">{formatCurrency(emp.sales_month)}</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#3b82f6]"
                      style={{ width: `${Math.min(targetPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Meta: {hasTarget ? formatCurrency(emp.target) : "—"}</span>
                    <span className="text-text-muted">Falta: {hasTarget ? formatCurrency(Math.max(emp.target - emp.sales_month, 0)) : "—"}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#10b981]">{formatPercent(emp.margin_pct)}</p>
                    <p className="text-xs text-text-muted">Margem</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-text-primary">{formatCurrency(emp.avg_ticket)}</p>
                    <p className="text-xs text-text-muted">Ticket Médio</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${emp.discount_avg > 8 ? "text-[#ef4444]" : "text-text-primary"}`}>{formatPercent(emp.discount_avg)}</p>
                    <p className="text-xs text-text-muted">Desc. Médio</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-text-primary">{emp.quotes_converted}/{emp.quotes_issued}</p>
                    <p className="text-xs text-text-muted">Orç. Conv.</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-text-muted">Produtos Premium (&gt;400€)</span>
                  <span className="text-sm font-bold text-[#f59e0b]">{emp.premium_sold ?? 0}</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Comparativo de Desempenho</h3>
          <p className="text-xs text-text-muted mb-4">Clica num colaborador para ver o detalhe completo.</p>
          <EmployeeDrilldown employees={employees} />
        </div>
    </>
  );
}

export default async function EquipaPage() {
  const session = await requireModule("equipa");
  const filters = await getGlobalFilters();

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Equipa e Desempenho" subtitle="Performance comercial por colaborador" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<TeamSkeleton />}>
          <TeamContent filters={filters} permissions={session.permissions} />
        </Suspense>
      </div>
    </div>
  );
}
