import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { DataTable } from "@/components/tables/DataTable";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { supplierPurchases, isOdataConfigured } from "@/lib/api/odata-map";
import { supplierSalesByProvider } from "@/lib/api/visual-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { getSupplierConfig, SUPPLIER_GROUP_LABELS, rappelForTotal, rappelPctForTotal, type SupplierGroup } from "@/lib/suppliers/store";
import { SUPPLIER_GROUPS } from "@/lib/suppliers/constants";
import { formatCurrency, formatPercent } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

/** Link para a página de detalhe de um fornecedor (o período vem do cookie global). */
function SupplierLink({ codigo, nome }: { codigo: string; nome: string }) {
  return (
    <Link href={`/fornecedores/${encodeURIComponent(codigo)}`} className="text-[#3b82f6] hover:text-[#60a5fa] hover:underline">
      {nome}
    </Link>
  );
}

export default async function FornecedoresPage() {
  await requireModule("fornecedores");
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);

  if (!isOdataConfigured()) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Fornecedores / Rappel" subtitle="Compras por fornecedor" />
        <div className="p-6 text-sm text-text-secondary">OData não configurado (ODATA_URL/USER/PASSWORD).</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Fornecedores / Rappel" subtitle="Compras, objetivos e rappel por fornecedor" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* Compras do mês e do ano — SEMPRE visíveis, independentes do filtro. */}
        <Suspense fallback={<div className="text-sm text-text-muted py-4">A carregar compras do mês/ano…</div>}>
          <ComprasMesAno />
        </Suspense>

        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>

        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar principais fornecedores…</div>}>
          <PrincipaisFornecedores from={from} to={to} />
        </Suspense>

        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar compras do período…</div>}>
          <FornecedoresPeriodo from={from} to={to} />
        </Suspense>
      </div>
    </div>
  );
}

/** KPIs de compras do MÊS atual e do ANO atual — sempre, independentes do período filtrado. */
async function ComprasMesAno() {
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const yEnd = new Date(now.getFullYear() + 1, 0, 1).toISOString();
  const [mes, ano] = await Promise.all([supplierPurchases(mStart, mEnd), supplierPurchases(yStart, yEnd)]);
  const totMes = mes.reduce((s, p) => s + p.total, 0);
  const totAno = ano.reduce((s, p) => s + p.total, 0);
  const mesLabel = now.toLocaleDateString("pt-PT", { month: "long" });
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard data={{ label: `Compras ${mesLabel}`, value: Math.round(totMes), unit: "€" }} />
      <KpiCard data={{ label: `Compras ${now.getFullYear()}`, value: Math.round(totAno), unit: "€" }} />
      <KpiCard data={{ label: "Fornec. (mês)", value: mes.length, unit: "" }} />
      <KpiCard data={{ label: "Fornec. (ano)", value: ano.length, unit: "" }} />
    </div>
  );
}

/**
 * Principais fornecedores por VENDAS no período, agrupados pelos 3 grupos
 * (Admin → Fornecedores). Cada fornecedor abre a página de análise detalhada.
 */
async function PrincipaisFornecedores({ from, to }: { from: string; to: string }) {
  const [sales, config] = await Promise.all([supplierSalesByProvider(from, to), getSupplierConfig()]);
  if (!sales.length) return null;
  // Só os grupos DEFINIDOS no Admin; fornecedores sem grupo são ignorados.
  const sections = SUPPLIER_GROUPS
    .map((g) => ({
      grupo: g,
      label: SUPPLIER_GROUP_LABELS[g],
      rows: sales.filter((s) => config[s.proveedor]?.grupo === g).slice(0, 10),
    }))
    .filter((s) => s.rows.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Principais Fornecedores (por vendas)</h3>
        <p className="text-xs text-text-muted">Clica num fornecedor para ver best-sellers, género, material, tipos, margens e ranking de vendedores.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sections.map((sec) => (
          <div key={sec.grupo} className="rounded-xl bg-bg-card border border-border p-4">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">{sec.label}</h4>
            <ul className="space-y-2">
              {sec.rows.map((r) => (
                <li key={r.proveedor} className="flex items-center justify-between gap-2 text-sm">
                  <SupplierLink codigo={r.proveedor} nome={r.nome} />
                  <span className="text-text-secondary tabular-nums whitespace-nowrap">{formatCurrency(r.sales)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vista do período filtrado: KPIs, agregação por grupo e detalhe por fornecedor. */
async function FornecedoresPeriodo({ from, to }: { from: string; to: string }) {
  const [purchases, config] = await Promise.all([supplierPurchases(from, to), getSupplierConfig()]);
  const cfgOf = (prov: string) => config[prov];
  const totalCompras = purchases.reduce((s, p) => s + p.total, 0);

  // Agregação só pelos grupos DEFINIDOS no Admin; fornecedores sem grupo são ignorados.
  const groups: SupplierGroup[] = ["oftalmicas", "contacto_saude", "armacoes_sol"];
  const byGroup = groups.map((g) => {
    const provs = purchases.filter((p) => cfgOf(p.proveedor)?.grupo === g);
    const compras = provs.reduce((s, p) => s + p.total, 0);
    const objetivo = provs.reduce((s, p) => s + (cfgOf(p.proveedor)?.objetivo_compra ?? 0), 0);
    // Rappel estimado = soma(rappel de cada fornecedor) — % do escalão atingido × compras.
    const rappel = provs.reduce((s, p) => s + rappelForTotal(p.total, cfgOf(p.proveedor) ?? {}), 0);
    const creditado = provs.reduce((s, p) => s + p.rappelCreditado, 0);
    return { grupo: g, label: SUPPLIER_GROUP_LABELS[g], compras, objetivo, rappel, creditado, count: provs.length };
  }).filter((g) => g.count > 0);
  const totalRappel = byGroup.reduce((s, g) => s + g.rappel, 0);
  // Rappel REAL: notas de crédito de rappel que o fornecedor já lançou no período.
  const totalCreditado = purchases.reduce((s, p) => s + p.rappelCreditado, 0);

  return (
    <>
        <h3 className="text-sm font-semibold text-text-primary">Período filtrado</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard data={{ label: "Total Compras", value: Math.round(totalCompras), unit: "€" }} />
          <KpiCard data={{ label: "Nº Fornecedores", value: purchases.length, unit: "" }} />
          <KpiCard data={{ label: "Rappel Estimado", value: Math.round(totalRappel), unit: "€" }} />
          <KpiCard data={{ label: "Rappel Creditado", value: Math.round(totalCreditado), unit: "€" }} />
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Por Grupo de Fornecedores</h3>
          <p className="text-xs text-text-muted mb-4">
            Grupos, objetivos de compra e % de rappel definem-se no Admin → Fornecedores.
            &quot;Estimado&quot; é o rappel calculado pelos patamares; &quot;Creditado&quot; é o que o
            fornecedor já lançou em nota de crédito no período.
          </p>
          <DataTable
            data={byGroup.map((g) => ({ ...g, id: g.grupo }))}
            keyField="id"
            columns={[
              { key: "label", label: "Grupo" },
              { key: "count", label: "Fornec.", render: r => <span className="text-text-secondary">{r.count}</span> },
              { key: "compras", label: "Compras", render: r => <span className="font-medium">{formatCurrency(r.compras)}</span> },
              { key: "objetivo", label: "Objetivo", render: r => <span className="text-text-secondary">{r.objetivo > 0 ? formatCurrency(r.objetivo) : "—"}</span> },
              { key: "cumprimento", label: "Cumpr.", render: r => <span className="text-[#3b82f6]">{r.objetivo > 0 ? formatPercent((r.compras / r.objetivo) * 100, 0) : "—"}</span> },
              { key: "rappel", label: "Rappel estim.", render: r => <span className="font-medium text-[#10b981]">{formatCurrency(r.rappel)}</span> },
              { key: "creditado", label: "Rappel creditado", render: r => <span className="text-text-secondary">{r.creditado ? formatCurrency(r.creditado) : "—"}</span> },
            ]}
          />
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Compras por Fornecedor</h3>
          <DataTable
            data={purchases.map((p) => {
              const c = cfgOf(p.proveedor);
              return {
                ...p,
                id: p.proveedor,
                grupo: c?.grupo ? SUPPLIER_GROUP_LABELS[c.grupo] : "—",
                rappel_pct: rappelPctForTotal(p.total, c ?? {}),
                rappel_val: rappelForTotal(p.total, c ?? {}),
              };
            })}
            keyField="id"
            columns={[
              { key: "nome", label: "Fornecedor", render: r => <SupplierLink codigo={r.proveedor} nome={r.nome} /> },
              { key: "grupo", label: "Grupo", render: r => <span className="text-text-secondary">{r.grupo}</span> },
              { key: "count", label: "Faturas", render: r => <span className="text-text-secondary">{r.count}</span> },
              { key: "total", label: "Compras", render: r => <span className="font-medium">{formatCurrency(r.total)}</span> },
              { key: "rappel_pct", label: "Rappel %", render: r => <span className="text-text-muted">{r.rappel_pct ? `${r.rappel_pct}%` : "—"}</span> },
              { key: "rappel_val", label: "Rappel estim.", render: r => <span className="text-[#10b981]">{r.rappel_pct ? formatCurrency(r.rappel_val) : "—"}</span> },
              { key: "rappelCreditado", label: "Rappel creditado", render: r => <span className="text-text-secondary">{r.rappelCreditado ? formatCurrency(r.rappelCreditado) : "—"}</span> },
            ]}
          />
        </div>
    </>
  );
}
