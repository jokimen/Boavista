"use client";

import { useState, useMemo } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { KpiCard } from "@/components/kpi/KpiCard";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/stock/constants";
import type { StockItem, StockSummary } from "@/types";

type Movement = { date: string; type: "entrada" | "venda"; qty: number; cost: number; ref: string };
type Store = { centro: number; existencias: number };
type ViewKey = "all" | "value_cost" | "value_sale" | "paused90" | "paused180";

const KNOWN = (n: number) => n < 9999; // tem registo de entrada conhecido

// Cada card abre uma lista com o filtro/ordenação correspondente.
const VIEWS: Record<ViewKey, { title: string; filter: (i: StockItem) => boolean; sort: (a: StockItem, b: StockItem) => number }> = {
  all: {
    title: "Todos os artigos em stock",
    filter: () => true,
    sort: (a, b) => (KNOWN(a.days_since_entry) === KNOWN(b.days_since_entry) ? b.days_since_entry - a.days_since_entry : KNOWN(a.days_since_entry) ? -1 : 1),
  },
  value_cost: { title: "Artigos por capital empatado (custo)", filter: () => true, sort: (a, b) => b.cost * b.quantity - a.cost * a.quantity },
  value_sale: { title: "Artigos por valor de venda (PVP)", filter: () => true, sort: (a, b) => b.price * b.quantity - a.price * a.quantity },
  paused90: { title: "Parados há +90 dias (desde a última entrada)", filter: (i) => i.days_since_entry >= 90 && KNOWN(i.days_since_entry), sort: (a, b) => b.days_since_entry - a.days_since_entry },
  paused180: { title: "Parados há +180 dias (desde a última entrada)", filter: (i) => i.days_since_entry >= 180 && KNOWN(i.days_since_entry), sort: (a, b) => b.days_since_entry - a.days_since_entry },
};

function pausedBadge(days: number) {
  return <Badge variant={days >= 365 ? "danger" : days >= 180 ? "warning" : days >= 90 ? "info" : "outline"}>{days >= 9999 ? "—" : `${days}d`}</Badge>;
}

export function StockOverview({ summary, items }: { summary: StockSummary; items: StockItem[] }) {
  const [view, setView] = useState<ViewKey | null>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<StockItem | null>(null);
  const [data, setData] = useState<{ movements: Movement[]; stores: Store[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const list = useMemo(() => {
    if (!view) return [];
    const v = VIEWS[view];
    const base = items.filter(v.filter).sort(v.sort);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((i) => i.brand.toLowerCase().includes(q) || i.model.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q))
      : base;
    return filtered.slice(0, 300);
  }, [view, query, items]);

  function openList(v: ViewKey) { setView(v); setQuery(""); setSel(null); }
  function closeModal() { setView(null); setSel(null); setData(null); }

  async function openItem(item: StockItem) {
    setSel(item); setData(null); setLoading(true);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(item.codigo)}`);
      setData(res.ok ? await res.json() : { movements: [], stores: [] });
    } catch { setData({ movements: [], stores: [] }); }
    finally { setLoading(false); }
  }

  const cards = [
    { key: "all" as ViewKey, data: { label: "Total Artigos", value: summary.total_items, unit: "" as const } },
    { key: "value_cost" as ViewKey, data: { label: "Capital Empatado", value: summary.total_value_cost, unit: "€" as const } },
    { key: "value_sale" as ViewKey, data: { label: "PVP Total Stock", value: summary.total_value_sale, unit: "€" as const } },
    { key: "paused90" as ViewKey, data: { label: "Parados +90d", value: summary.items_90d, unit: "" as const } },
    { key: "paused180" as ViewKey, data: { label: "Parados +180d", value: summary.items_180d, unit: "" as const } },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => <KpiCard key={c.key} data={c.data} onClick={() => openList(c.key)} />)}
      </div>
      <p className="text-xs text-text-muted">Clica num cartão para abrir a lista correspondente; depois clica numa linha para ver movimentos e stock por loja.</p>

      <Modal open={!!view} onClose={closeModal} title={sel ? `${sel.brand} ${sel.model}` : view ? VIEWS[view].title : ""} size="xl">
        {sel ? (
          <div className="space-y-4">
            <button onClick={() => { setSel(null); setData(null); }} className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-[#3b82f6] transition-colors">
              <ArrowLeft size={14} /> Voltar à lista
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-text-muted">Código</p><p className="text-text-primary">{sel.codigo}</p></div>
              <div><p className="text-xs text-text-muted">Custo / PVP</p><p className="text-text-primary">{formatCurrency(sel.cost)} / {formatCurrency(sel.price)}</p></div>
              <div><p className="text-xs text-text-muted">Margem</p><p className="text-[#10b981]">{formatPercent(sel.margin_pct)}</p></div>
              <div><p className="text-xs text-text-muted">Parado Há</p><p className="text-text-primary">{sel.days_since_entry >= 9999 ? "—" : `${sel.days_since_entry} dias`}{sel.last_entry_date ? ` (entrada ${new Date(sel.last_entry_date).toLocaleDateString("pt-PT")})` : ""}</p></div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Stock por Loja</h4>
              {loading ? <p className="text-xs text-text-muted">A carregar…</p> : (
                <div className="flex flex-wrap gap-2">
                  {(data?.stores ?? []).length ? data!.stores.map((s) => (
                    <Badge key={s.centro} variant="info">Centro {s.centro}: {s.existencias}</Badge>
                  )) : <span className="text-xs text-text-muted">Sem dados de stock por loja.</span>}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Histórico de Movimentos (2 anos)</h4>
              {loading ? <p className="text-xs text-text-muted">A carregar…</p> : (
                <div className="overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-2">Data</th><th className="py-1.5 px-2">Tipo</th><th className="py-1.5 px-2 text-right">Qtd</th><th className="py-1.5 px-2 text-right">Valor</th><th className="py-1.5 px-2">Ref</th></tr></thead>
                    <tbody>
                      {(data?.movements ?? []).length ? data!.movements.map((m, k) => (
                        <tr key={k} className="border-b border-border/50">
                          <td className="py-1.5 pr-2 text-text-secondary">{m.date ? new Date(m.date).toLocaleDateString("pt-PT") : "—"}</td>
                          <td className="py-1.5 px-2"><Badge variant={m.type === "entrada" ? "success" : "outline"}>{m.type === "entrada" ? "Entrada" : "Venda"}</Badge></td>
                          <td className="py-1.5 px-2 text-right">{m.qty}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(m.cost)}</td>
                          <td className="py-1.5 px-2 text-text-muted">{m.ref}</td>
                        </tr>
                      )) : <tr><td colSpan={5} className="py-3 text-center text-text-muted">Sem movimentos no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar marca, modelo ou código…"
                className="bg-bg-elevated border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary w-full sm:w-80 focus:border-[#3b82f6] outline-none" />
            </div>
            <p className="text-xs text-text-muted">{list.length} artigo(s){query ? " encontrados" : ""}{list.length === 300 ? " (mostra os primeiros 300)" : ""}.</p>
            <div className="overflow-auto max-h-[26rem]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-card">
                  <tr className="text-left text-xs text-text-muted border-b border-border">
                    <th className="py-2 pr-3">Marca</th><th className="py-2 px-2">Modelo</th><th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-right">Custo</th><th className="py-2 px-2 text-right">PVP</th>
                    <th className="py-2 px-2 text-right">Qtd</th><th className="py-2 px-2">Parado Há</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id} onClick={() => openItem(i)} className="border-b border-border/60 hover:bg-bg-card-hover cursor-pointer">
                      <td className="py-1.5 pr-3 text-text-strong">{i.brand || "—"}</td>
                      <td className="py-1.5 px-2 text-text-secondary max-w-[16rem] truncate">{i.model}</td>
                      <td className="py-1.5 px-2 text-text-secondary">{CATEGORY_LABELS[i.category] ?? i.category}</td>
                      <td className="py-1.5 px-2 text-right">{formatCurrency(i.cost)}</td>
                      <td className="py-1.5 px-2 text-right">{formatCurrency(i.price)}</td>
                      <td className="py-1.5 px-2 text-right">{i.quantity}</td>
                      <td className="py-1.5 px-2">{pausedBadge(i.days_since_entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
