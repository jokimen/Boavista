import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { GlobalFilters } from "@/components/layout/GlobalFilters";
import { DataTable } from "@/components/tables/DataTable";
import { SplitBars } from "@/components/charts/SplitBars";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { resolveDateRange, type DashboardFilters } from "@/lib/filters/range";
import { getGlobalFilters } from "@/lib/filters/cookie";
import { supplierAnalytics, type SupplierAnalytics } from "@/lib/api/visual-map";
import { isOdataConfigured } from "@/lib/api/odata-map";
import { fetchEmployees } from "@/lib/api/adapter";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { getSupplierConfig } from "@/lib/suppliers/store";
import { SUPPLIER_GROUP_LABELS, type SupplierConfig } from "@/lib/suppliers/constants";
import { formatCurrency } from "@/lib/utils";

// Barra de filtros — colaboradores via API (lentos no 1º load). Em Suspense.
async function FiltersBar({ value }: { value: DashboardFilters }) {
  let employees: Awaited<ReturnType<typeof fetchEmployees>> = [];
  try { employees = await fetchEmployees(); } catch { employees = []; }
  return <GlobalFilters compact employees={employees} value={value} />;
}

export default async function FornecedorDetailPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  await requireModule("fornecedores");
  const { codigo } = await params;
  const filters = await getGlobalFilters();
  const { from, to } = resolveDateRange(filters);

  if (!isOdataConfigured()) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Fornecedor" backHref="/fornecedores" />
        <div className="p-6 text-sm text-text-secondary">OData não configurado (ODATA_URL/USER/PASSWORD).</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Fornecedor" subtitle="Análise de vendas no período" backHref="/fornecedores" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<GlobalFilters compact value={filters} />}>
          <FiltersBar value={filters} />
        </Suspense>
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar análise do fornecedor…</div>}>
          <SupplierDetail codigo={decodeURIComponent(codigo)} from={from} to={to} />
        </Suspense>
      </div>
    </div>
  );
}

function Card({ title, hint, info, children }: { title: string; hint?: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-1.5">
        {title}
        {info && <ChartInfo id={info} size={13} />}
      </h3>
      {hint && <p className="text-xs text-text-muted mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

async function SupplierDetail({ codigo, from, to }: { codigo: string; from: string; to: string }) {
  const [saudeCodes, config] = await Promise.all([getSaudeOcularCodes().catch(() => [] as string[]), getSupplierConfig().catch(() => ({} as SupplierConfig))]);
  const a: SupplierAnalytics | null = await supplierAnalytics(codigo, from, to, saudeCodes);
  if (!a || a.total_qty === 0) {
    return <p className="text-sm text-text-secondary py-8 text-center">Sem vendas atribuídas a este fornecedor no período selecionado.</p>;
  }
  const grupo = config[codigo]?.grupo;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-text-primary">{a.nome}</h2>
        <p className="text-xs text-text-muted">
          Código {a.proveedor}
          {grupo && <> · Grupo: <span className="text-text-secondary">{SUPPLIER_GROUP_LABELS[grupo]}</span></>}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard data={{ label: "Vendas", value: Math.round(a.total_sales), unit: "€", infoId: "kpi-vendas" }} />
        <KpiCard data={{ label: "Unidades", value: a.total_qty, unit: "" }} />
        <KpiCard data={{ label: "Nº Vendas", value: a.num_ventas, unit: "", infoId: "kpi-num-vendas" }} />
        <KpiCard data={{ label: "Ticket Médio", value: Math.round(a.avg_ticket), unit: "€", infoId: "kpi-ticket" }} />
        <KpiCard data={{ label: "Margem", value: a.margin_pct, unit: "%", infoId: "kpi-margem-pct" }} />
        <KpiCard data={{ label: "Cobertura margem", value: a.coverage_pct, unit: "%", infoId: "kpi-cobertura" }} />
      </div>

      {/* Categorias vendidas */}
      {a.by_category.length > 1 && (
        <Card title="Vendas por categoria" info="category">
          <SplitBars items={a.by_category.map((c) => ({ label: c.label, qty: c.qty, sales: c.sales, pct: 0 }))} unit="eur" />
        </Card>
      )}

      {/* Best sellers + Ranking vendedores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Best Sellers" info="sup-best-sellers" hint="Produtos mais vendidos (quantidade) deste fornecedor.">
          <DataTable
            data={a.best_sellers.map((b, i) => ({ ...b, id: `${i}-${b.name}` }))}
            keyField="id"
            maxHeight="max-h-[420px]"
            columns={[
              { key: "name", label: "Produto" },
              { key: "qty", label: "Un.", render: (r) => <span className="font-medium tabular-nums">{r.qty}</span> },
              { key: "sales", label: "Vendas", render: (r) => <span className="tabular-nums">{formatCurrency(r.sales)}</span> },
              { key: "margin_pct", label: "Margem", render: (r) => <span className="text-[#10b981] tabular-nums">{r.margin_pct ? `${r.margin_pct}%` : "—"}</span> },
            ]}
          />
        </Card>

        <Card title="Ranking de Vendedores" info="sup-ranking" hint="Quem mais vende deste fornecedor (valor, quantidade e produto-estrela).">
          <DataTable
            data={a.sellers.map((s) => ({ ...s, id: s.usuario }))}
            keyField="id"
            maxHeight="max-h-[420px]"
            columns={[
              { key: "usuario", label: "Vendedor" },
              { key: "sales", label: "Vendas", render: (r) => <span className="font-medium tabular-nums">{formatCurrency(r.sales)}</span> },
              { key: "qty", label: "Un.", render: (r) => <span className="tabular-nums">{r.qty}</span> },
              { key: "num_ventas", label: "Vendas", render: (r) => <span className="text-text-secondary tabular-nums">{r.num_ventas}</span> },
              { key: "top_product", label: "Mais vende", render: (r) => <span className="text-text-secondary text-xs">{r.top_product}</span> },
            ]}
          />
        </Card>
      </div>

      {/* Demografia do comprador */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Comprador por género" info="sup-genero" hint="Género do cliente que comprou (não o género-alvo do produto).">
          <SplitBars items={a.buyer_gender} />
        </Card>
        <Card title="Comprador por faixa etária" info="sup-idade">
          <SplitBars items={a.age_bands} />
        </Card>
      </div>

      {/* Armações / Sol */}
      {a.frames && (
        <Card title="Armações / Óculos de Sol" info="sup-armacoes" hint="Género-alvo e material vêm da ficha do produto (Visual).">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Por género-alvo</p>
              <SplitBars items={a.frames.by_gender} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Por material</p>
              <SplitBars items={a.frames.by_material} />
            </div>
          </div>
        </Card>
      )}

      {/* Lentes de Contacto */}
      {a.contact && (
        <Card title="Lentes de Contacto" info="sup-lc">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Por periodicidade</p>
              <SplitBars items={a.contact.by_schedule} />
            </div>
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Por tipo ótico</p>
              <SplitBars items={a.contact.by_prescription} />
            </div>
          </div>
          <div className="text-xs text-text-muted">
            Vendas de saúde ocular deste fornecedor: <span className="text-[#10b981] font-medium">{formatCurrency(a.contact.saude_sales)}</span>
            {a.contact.saude_sales === 0 && <span className="ml-1">(definir códigos em Admin → Objetivos → Saúde Ocular)</span>}
          </div>
        </Card>
      )}

      {/* Lentes Oftálmicas */}
      {a.lenses && (
        <Card title="Lentes Oftálmicas" info="sup-lentes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Por tipo</p>
              <SplitBars items={a.lenses.by_type} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-text-secondary mb-2">2º Par</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-bg-sidebar border border-border p-3">
                  <div className="text-xs text-text-muted">Vendas 2º par</div>
                  <div className="text-xl font-bold text-text-primary">{a.lenses.second_pair_ventas}</div>
                </div>
                <div className="rounded-lg bg-bg-sidebar border border-border p-3">
                  <div className="text-xs text-text-muted">€ em 2º par</div>
                  <div className="text-xl font-bold text-text-primary">{formatCurrency(a.lenses.second_pair_sales)}</div>
                </div>
              </div>
            </div>
          </div>

          {a.lenses.smartlife && a.lenses.smartlife.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium text-text-secondary mb-2">SmartLife por vendedor (monofocais vs progressivas)</p>
              <DataTable
                data={a.lenses.smartlife.map((s) => ({ ...s, id: s.usuario }))}
                keyField="id"
                columns={[
                  { key: "usuario", label: "Vendedor" },
                  { key: "monofocais", label: "Monofocais SmartLife", render: (r) => <span className="font-medium tabular-nums">{r.monofocais}</span> },
                  { key: "progressivas", label: "Progressivas SmartLife", render: (r) => <span className="font-medium tabular-nums">{r.progressivas}</span> },
                  { key: "outras", label: "Outras", render: (r) => <span className="text-text-secondary tabular-nums">{r.outras}</span> },
                ]}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
