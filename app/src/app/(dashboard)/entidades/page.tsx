import { Suspense } from "react";
import Link from "next/link";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { ExportData } from "@/components/tables/ExportData";
import { ChartInfo } from "@/components/charts/ChartInfo";
import { ManualDateRange } from "@/components/layout/ManualDateRange";
import { canExport } from "@/lib/auth/permissions";
import { insurerEntities } from "@/lib/api/visual-map";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";
import { formatCurrency } from "@/lib/utils";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function BoxFallback({ msg }: { msg: string }) {
  return <div className="rounded-xl bg-bg-card border border-border p-6 text-sm text-text-secondary">{msg}</div>;
}

/** Vendas com seguro, por entidade. Pesado (faturas + linhas) → em Suspense. */
async function Entidades({ fromISO, toISO, fromYmd, toYmd, podeExportar }: {
  fromISO: string; toISO: string; fromYmd: string; toYmd: string; podeExportar: boolean;
}) {
  const config = await getAseguradoraConfig().catch(() => ({}));
  const names: Record<string, string> = {};
  for (const [cod, row] of Object.entries(config)) if (row.ativo !== false) names[cod] = row.nome;
  const rows = await insurerEntities(fromISO, toISO, names).catch(() => []);

  if (!rows.length) return <BoxFallback msg="Sem vendas com seguro no período selecionado." />;

  const totVendas = rows.reduce((s, r) => s + r.vendas, 0);
  const totValor = rows.reduce((s, r) => s + r.total, 0);
  const totComp = rows.reduce((s, r) => s + r.comparticipacao, 0);
  const porRotular = rows.filter((r) => !names[r.codigo]?.trim()).length;
  const detailQuery = `?from=${fromYmd}&to=${toYmd}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard data={{ label: "Vendas com Seguro", value: totVendas, unit: "" }} />
        <KpiCard data={{ label: "Valor Total", value: Math.round(totValor), unit: "€" }} />
        <KpiCard data={{ label: "Comparticipação", value: Math.round(totComp), unit: "€" }} />
        <KpiCard data={{ label: "Entidades", value: rows.length, unit: "" }} />
      </div>

      {porRotular > 0 && (
        <div className="rounded-xl bg-warning-bg border border-border p-3 text-xs text-text-secondary">
          {porRotular} entidade(s) ainda sem nome — o Visual só dá o código da seguradora.
          Dá-lhes nome em <Link href="/admin/seguradoras" className="text-[#3b82f6] hover:underline">Admin → Seguradoras</Link>.
        </div>
      )}

      <div className="rounded-xl bg-bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            Vendas por Entidade
            <ChartInfo id="entidades-vendas" />
          </h3>
          <ExportData
            title="Vendas por entidade"
            canExport={podeExportar}
            columns={[
              { key: "name", label: "Entidade" },
              { key: "vendas", label: "Nº Vendas" },
              { key: "total", label: "Valor Total" },
              { key: "descMedio", label: "Desconto Médio" },
              { key: "comparticipacao", label: "Comparticipação" },
            ]}
            rows={rows}
          />
        </div>
        <p className="text-xs text-text-muted mb-4">Clica numa entidade para ver ticket médio, produtos, margem e vendedores.</p>
        <DataTable
          data={rows.map((r) => ({ ...r, id: r.codigo }))}
          keyField="id"
          columns={[
            {
              key: "name", label: "Entidade",
              render: (r) => (
                <Link href={`/entidades/${encodeURIComponent(r.codigo)}${detailQuery}`} className="text-[#3b82f6] hover:underline font-medium">
                  {r.name}
                </Link>
              ),
            },
            { key: "vendas", label: "Nº Vendas", render: (r) => <span className="text-text-secondary">{r.vendas}</span> },
            { key: "total", label: "Valor Total", render: (r) => <span className="font-medium">{formatCurrency(r.total)}</span> },
            { key: "descMedio", label: "Desconto Médio", render: (r) => <span className="text-text-secondary">{formatCurrency(r.descMedio)}</span> },
            { key: "comparticipacao", label: "Comparticipação", render: (r) => <span className="text-[#10b981]">{formatCurrency(r.comparticipacao)}</span> },
          ]}
        />
      </div>
    </>
  );
}

export default async function EntidadesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireModule("entidades");
  const sp = await searchParams;
  const podeExportar = canExport(session.permissions, "entidades");

  // Intervalo APENAS dos campos De/Até (URL). Default: mês atual (dia 1 → hoje).
  const now = new Date();
  const fromYmd = isYmd(sp.from) ? sp.from : ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const toYmd = isYmd(sp.to) ? sp.to : ymd(now);
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const fromISO = new Date(fy, fm - 1, fd).toISOString();
  const toISO = new Date(ty, tm - 1, td + 1).toISOString(); // dia seguinte (exclusivo) → inclui o "Até"

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Entidades" />
      <div className="p-6 space-y-6">
        {/* Datas De/Até (comandam o intervalo do menu) */}
        <ManualDateRange initialFrom={fromYmd} initialTo={toYmd} />
        <Suspense key={`${fromYmd}-${toYmd}`} fallback={<BoxFallback msg="A carregar vendas com seguro…" />}>
          <Entidades fromISO={fromISO} toISO={toISO} fromYmd={fromYmd} toYmd={toYmd} podeExportar={podeExportar} />
        </Suspense>
      </div>
    </div>
  );
}
