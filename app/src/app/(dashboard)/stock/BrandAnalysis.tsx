"use client";

import { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";
import { KpiCard } from "@/components/kpi/KpiCard";
import { SplitBars } from "@/components/charts/SplitBars";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/charts/ChartInfo";
import type { BenchmarkMetric, BrandAnalysis as BrandAnalysisData, RotationRow } from "@/lib/stock/constants";

const eur = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " €";

/** Barras anuais (vendido vs comprado) — escala partilhada, sem Recharts. */
function YearBars({ sold, bought, revenue }: { sold: { year: number; qty: number }[]; bought: { year: number; qty: number }[]; revenue: { year: number; revenue: number }[] }) {
  const max = Math.max(1, ...sold.map((s) => s.qty), ...bought.map((b) => b.qty));
  return (
    <div className="space-y-3">
      {sold.map((s, i) => {
        const b = bought[i]?.qty ?? 0;
        const rev = revenue[i]?.revenue ?? 0;
        return (
          <div key={s.year} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-strong font-medium tabular-nums">
                {s.year}
                {rev > 0 && <span className="text-text-muted font-normal ml-2">{eur(rev)}</span>}
              </span>
              <span className="text-text-secondary tabular-nums">
                <span className="text-[#10b981]">{s.qty} vend.</span>
                <span className="text-text-muted mx-1">·</span>
                <span className="text-[#3b82f6]">{b} compr.</span>
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-[#10b981]" style={{ width: `${Math.max((s.qty / max) * 100, s.qty ? 3 : 0)}%` }} />
              </div>
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${Math.max((b / max) * 100, b ? 3 : 0)}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RotationTable({ rows, emptyHint }: { rows: RotationRow[]; emptyHint: string }) {
  if (!rows.length) return <p className="text-xs text-text-muted">{emptyHint}</p>;
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            <th className="py-1.5 pr-2">Modelo</th>
            <th className="py-1.5 px-2 text-right">Stock</th>
            <th className="py-1.5 px-2 text-right">Vend. 4a</th>
            <th className="py-1.5 px-2 text-right">Rotação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.codigo} className="border-b border-border/50">
              <td className="py-1.5 pr-2 text-text-secondary max-w-[14rem] truncate">{r.model || r.codigo}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{r.stock}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{r.sold4y}</td>
              <td className="py-1.5 px-2 text-right">
                <Badge variant={r.ratio >= 1 ? "success" : r.ratio >= 0.3 ? "info" : "warning"}>{r.ratio.toFixed(2)}×</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Formata o valor de uma métrica de benchmark conforme a unidade. */
function fmtMetric(v: number, unit: BenchmarkMetric["unit"]): string {
  if (unit === "€") return eur(v);
  if (unit === "×") return v.toFixed(2) + "×";
  return v.toFixed(0) + "%";
}

/** Bloco de benchmark: marca vs média do universo armações/sol + percentil. */
function BenchmarkBlock({ metrics }: { metrics: BenchmarkMetric[] }) {
  if (!metrics.length) return null;
  return (
    <div className="space-y-3">
      {metrics.map((m) => {
        const above = m.brand >= m.avg;
        return (
          <div key={m.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{m.label}</span>
              <span className="tabular-nums">
                <span className={above ? "text-[#10b981] font-medium" : "text-[#f59e0b] font-medium"}>{fmtMetric(m.brand, m.unit)}</span>
                <span className="text-text-muted mx-1">vs média</span>
                <span className="text-text-strong">{fmtMetric(m.avg, m.unit)}</span>
              </span>
            </div>
            {/* Barra de percentil (posição entre as marcas) com marcador da média a 50%. */}
            <div className="relative h-2 rounded-full bg-border overflow-hidden">
              <div className={`h-full rounded-full ${above ? "bg-[#10b981]" : "bg-[#f59e0b]"}`} style={{ width: `${Math.max(m.percentile, 3)}%` }} />
            </div>
            <div className="text-[10px] text-text-muted tabular-nums">Percentil {m.percentile} — melhor que {m.percentile}% das marcas</div>
          </div>
        );
      })}
    </div>
  );
}

export function BrandAnalysis({ brands }: { brands: string[] }) {
  const [marca, setMarca] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BrandAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sugestões à medida que se escreve: prefixo primeiro, depois substring.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands.slice(0, 50);
    return brands
      .filter((b) => b.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.localeCompare(b, "pt");
      })
      .slice(0, 50);
  }, [query, brands]);

  function pick(brand: string) {
    setQuery(brand);
    setOpen(false);
    load(brand);
  }

  async function load(brand: string) {
    const m = brand.trim();
    if (!m || !brands.includes(m)) return;
    setMarca(m);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/brand?marca=${encodeURIComponent(m)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Falha ao carregar a marca");
      setData(await res.json());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          Análise por Marca
          <ChartInfo id="stock-brand" />
        </h3>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted z-10" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Escrever marca de armação/sol…"
            className="bg-bg-elevated border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary w-64 focus:border-[#3b82f6] outline-none"
          />
          {open && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-64 max-h-64 overflow-auto rounded-lg border border-border bg-bg-elevated shadow-lg py-1">
              {matches.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(b); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-card-hover ${b === marca ? "text-[#3b82f6]" : "text-text-secondary"}`}
                  >
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && query.trim() && matches.length === 0 && (
            <div className="absolute z-20 mt-1 w-64 rounded-lg border border-border bg-bg-elevated shadow-lg px-3 py-2 text-xs text-text-muted">
              Sem marcas de armação/sol para “{query.trim()}”.
            </div>
          )}
        </div>
      </div>

      {!marca && <p className="text-xs text-text-muted">Escreve o nome de uma marca de armação ou óculos de sol para ver o stock, a rotação por modelo e o histórico de 4 anos.</p>}
      {error && <p className="text-xs text-[#ef4444]">{error}</p>}
      {loading && <p className="text-xs text-text-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> A carregar {marca}…</p>}

      {data && !loading && (
        <div className="space-y-5">
          {data.pendingHistory && (
            <p className="text-xs text-[#f59e0b]">⚠ Histórico de 4 anos ainda não pré-calculado (corre o cron <code>brand-history</code> no PC da loja). Mostro apenas o stock atual.</p>
          )}

          <div>
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Stock atual</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard data={{ label: "Em Stock", value: data.inStock, unit: "" }} />
              <KpiCard data={{ label: "Capital Empatado", value: data.stockValueCost, unit: "€" }} />
              <KpiCard data={{ label: "Valor a PVP", value: data.stockValueSale, unit: "€" }} />
              <KpiCard data={{ label: "Margem", value: data.marginPct, unit: "%" }} />
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Vendas (4 anos)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiCard data={{ label: "Faturação", value: data.revenue4y, unit: "€" }} />
              <KpiCard data={{ label: "Margem Gerada", value: data.marginEur4y, unit: "€" }} />
              <KpiCard data={{ label: "Margem Vendas", value: data.salesMarginPct, unit: "%" }} />
              <KpiCard data={{ label: "Vendidos", value: data.sold4y, unit: "" }} />
              <KpiCard data={{ label: "Comprados", value: data.bought4y, unit: "" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Vendido vs Comprado por ano</h4>
              <YearBars sold={data.soldByYear} bought={data.boughtByYear} revenue={data.revenueByYear} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Stock por categoria</h4>
              <SplitBars items={data.byClass} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Stock por material</h4>
              <SplitBars items={data.byMaterial} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Stock por género</h4>
              <SplitBars items={data.byGender} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Melhor rotação <span className="normal-case text-text-muted">(vende-se, repor)</span></h4>
              <RotationTable rows={data.topRotation} emptyHint="Sem histórico de vendas para esta marca." />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Pior rotação <span className="normal-case text-text-muted">(parado, não repor)</span></h4>
              <RotationTable rows={data.bottomRotation} emptyHint="Sem stock para esta marca." />
            </div>
          </div>

          {data.benchmark.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 flex items-center gap-2">
                {data.marca} vs média (armações/sol)
                <ChartInfo id="stock-brand-benchmark" />
              </h4>
              <BenchmarkBlock metrics={data.benchmark} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
