"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Save, Search, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { SUPPLIER_GROUPS, SUPPLIER_GROUP_LABELS, normalizeTiers, rappelForTotal, rappelPctForTotal, type SupplierGroup, type SupplierConfig, type RappelTier } from "@/lib/suppliers/constants";
import { parseEuroInput } from "@/lib/utils";

type Supplier = { proveedor: string; nome: string };
type Tier = { min: string; pct: string };
type Row = { proveedor: string; nome: string; grupo: SupplierGroup | ""; objetivo_compra: string; tiers: Tier[] };

const eur = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 0 });
/** € (ponto=milhares, vírgula=decimal) — evita "10.000" virar 10. */
const eurNum = (s: string): number => parseEuroInput(s) ?? 0;
/** % (apenas decimal — "2,5" ou "2.5" = 2,5). */
const pctNum = (s: string): number => Number((s || "").replace(",", ".")) || 0;
/** Converte os escalões (strings) para números, para cálculo/preview. */
const tiersNum = (tiers: Tier[]): RappelTier[] => tiers.map((t) => ({ min: eurNum(t.min), pct: pctNum(t.pct) }));

/** Resumo compacto dos escalões: "≥10 000€: 2% · ≥20 000€: 3%". */
function tiersSummary(tiers: Tier[]): string {
  const norm = normalizeTiers(tiers.map((t) => ({ min: eurNum(t.min), pct: pctNum(t.pct) })));
  if (!norm.length) return "—";
  return norm.map((t) => `≥${t.min.toLocaleString("pt-PT")}€: ${t.pct}%`).join(" · ");
}

export function SupplierConfigForm({ suppliers, config, purchases = {}, purchasesYear }: { suppliers: Supplier[]; config: SupplierConfig; purchases?: Record<string, number>; purchasesYear?: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const s of suppliers) {
      const c = config[s.proveedor];
      // Escalões existentes; se não houver mas existir rappel plano legado (>0), semeia um escalão {0, pct}.
      let tiers: Tier[] = (c?.rappel_tiers ?? []).map((t) => ({ min: String(t.min), pct: String(t.pct) }));
      if (!tiers.length && c?.rappel_pct) tiers = [{ min: "0", pct: String(c.rappel_pct) }];
      init[s.proveedor] = {
        proveedor: s.proveedor, nome: s.nome,
        grupo: (c?.grupo ?? "") as SupplierGroup | "",
        objetivo_compra: c?.objetivo_compra ? String(c.objetivo_compra) : "",
        tiers,
      };
    }
    return init;
  });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const hasCfg = (r: Row) => r.grupo || r.objetivo_compra || r.tiers.length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Object.values(rows);
    if (!q) return list.filter(hasCfg).concat(list.filter((r) => !hasCfg(r))).slice(0, 80);
    return list.filter((r) => r.nome.toLowerCase().includes(q) || r.proveedor.toLowerCase().includes(q)).slice(0, 80);
  }, [rows, query]);

  const set = (prov: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [prov]: { ...r[prov], ...patch } }));
  const setTiers = (prov: string, tiers: Tier[]) => set(prov, { tiers });
  const addTier = (prov: string) => setRows((r) => ({ ...r, [prov]: { ...r[prov], tiers: [...r[prov].tiers, { min: "", pct: "" }] } }));
  const removeTier = (prov: string, i: number) => setRows((r) => ({ ...r, [prov]: { ...r[prov], tiers: r[prov].tiers.filter((_, j) => j !== i) } }));
  const setTier = (prov: string, i: number, patch: Partial<Tier>) =>
    setRows((r) => ({ ...r, [prov]: { ...r[prov], tiers: r[prov].tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) } }));

  async function save() {
    setSaving(true); setMsg(null);
    const payload = Object.values(rows).map((r) => ({
      proveedor: r.proveedor, nome: r.nome,
      grupo: r.grupo === "" ? null : r.grupo,
      objetivo_compra: eurNum(r.objetivo_compra),
      rappel_pct: 0, // legado: o rappel passou a ser definido por escalões
      rappel_tiers: r.tiers
        .map((t) => ({ min: eurNum(t.min), pct: pctNum(t.pct) }))
        .filter((t) => t.pct > 0)
        .sort((a, b) => a.min - b.min),
    }));
    try {
      const res = await fetch("/api/admin/suppliers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppliers: payload }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Falha");
      const j = await res.json();
      setMsg({ type: "ok", text: `Guardado (${j.count} fornecedores com config).` });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally { setSaving(false); }
  }

  const inp = "bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:border-[#3b82f6] outline-none";
  return (
    <div className="rounded-xl bg-bg-card border border-border p-5 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar fornecedor…"
            className="bg-bg-elevated border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary w-64 focus:border-[#3b82f6] outline-none" />
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Save size={15} /> {saving ? "A guardar…" : "Guardar"}
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.type === "ok" ? "text-[#10b981]" : "text-[#ef4444]"}`}>{msg.text}</p>}
      <p className="text-xs text-text-muted">
        A mostrar até 80 fornecedores. O <strong>rappel</strong> define-se por escalões: a % do patamar mais alto
        atingido pelas compras aplica-se ao <strong>total</strong> (ex.: ≥10 000€ = 2%, ≥20 000€ = 3%).
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted border-b border-border">
              <th className="py-2 pr-3">Fornecedor</th>
              <th className="py-2 px-2">Grupo</th>
              <th className="py-2 px-2 w-32">Objetivo €</th>
              <th className="py-2 px-2">Rappel (escalões)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = !!open[r.proveedor];
              // Estado em tempo real: compras do ano + patamar/rappel atingido.
              const total = purchases[r.proveedor] ?? 0;
              const tn = tiersNum(r.tiers);
              const curPct = rappelPctForTotal(total, { rappel_tiers: tn });
              const curRappel = rappelForTotal(total, { rappel_tiers: tn });
              const norm = normalizeTiers(tn.filter((t) => t.pct > 0));
              const activeMin = norm.filter((t) => t.min <= total).map((t) => t.min).pop();
              const next = norm.find((t) => t.min > total);
              return (
                <FragmentRow key={r.proveedor}>
                  <tr className="border-b border-border/60">
                    <td className="py-1.5 pr-3 text-text-strong">{r.nome}</td>
                    <td className="py-1.5 px-2">
                      <select value={r.grupo} onChange={(e) => set(r.proveedor, { grupo: e.target.value as SupplierGroup | "" })} className={inp}>
                        <option value="">—</option>
                        {SUPPLIER_GROUPS.map((g) => <option key={g} value={g}>{SUPPLIER_GROUP_LABELS[g]}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <input type="text" inputMode="decimal" value={r.objetivo_compra}
                        onChange={(e) => set(r.proveedor, { objetivo_compra: e.target.value })} placeholder="—"
                        className={`w-28 text-right ${inp}`} />
                    </td>
                    <td className="py-1.5 px-2">
                      <button onClick={() => setOpen((o) => ({ ...o, [r.proveedor]: !isOpen }))}
                        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className={r.tiers.length ? "text-[#10b981]" : ""}>{tiersSummary(r.tiers)}</span>
                        {curPct > 0 && (
                          <span className="ml-1 text-[#f59e0b]">→ atual {curPct}% = {eur(curRappel)}€</span>
                        )}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-bg-elevated/40 border-b border-border/60">
                      <td colSpan={4} className="px-3 py-3">
                        <div className="space-y-2">
                          {/* Painel "como estou" — compras do ano + patamar/rappel atingido */}
                          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap rounded-lg bg-bg-elevated border border-border px-3 py-2 text-xs">
                            <span className="text-text-secondary">Compras{purchasesYear ? ` ${purchasesYear}` : ""}: <strong className="text-text-primary">{eur(total)} €</strong></span>
                            <span className="text-text-secondary">Patamar atual: <strong className={curPct > 0 ? "text-[#f59e0b]" : "text-text-muted"}>{curPct > 0 ? `${curPct}%` : "nenhum"}</strong></span>
                            <span className="text-text-secondary">Rappel atual: <strong className="text-[#10b981]">{eur(curRappel)} €</strong></span>
                            {next && (
                              <span className="text-text-muted">Faltam <strong className="text-text-strong">{eur(Math.max(0, next.min - total))} €</strong> para o patamar {next.pct}%</span>
                            )}
                          </div>
                          {r.tiers.length === 0 && <p className="text-xs text-text-muted">Sem escalões. Adiciona todos os patamares possíveis (a partir de X € → Y %).</p>}
                          {r.tiers.map((t, i) => {
                            const tMin = eurNum(t.min);
                            const tPct = pctNum(t.pct);
                            const active = activeMin !== undefined && tPct > 0 && tMin === activeMin;
                            return (
                              <div key={i} className={`flex items-center gap-2 flex-wrap rounded-lg px-2 py-1 ${active ? "bg-[#10b981]/10 ring-1 ring-[#10b981]/40" : ""}`}>
                                <span className="text-xs text-text-muted">A partir de</span>
                                <input type="text" inputMode="decimal" value={t.min} placeholder="0"
                                  onChange={(e) => setTier(r.proveedor, i, { min: e.target.value })} className={`w-28 text-right ${inp}`} />
                                <span className="text-xs text-text-muted">€  →</span>
                                <input type="number" min="0" max="100" step="0.5" value={t.pct} placeholder="%"
                                  onChange={(e) => setTier(r.proveedor, i, { pct: e.target.value })} className={`w-20 text-right ${inp}`} />
                                <span className="text-xs text-text-muted">%</span>
                                {active && <span className="text-[10px] font-semibold text-[#10b981]">● ATINGIDO</span>}
                                <button onClick={() => removeTier(r.proveedor, i)} className="text-[#ef4444] hover:text-[#f87171] p-1 ml-auto" title="Remover">
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })}
                          <button onClick={() => addTier(r.proveedor)}
                            className="flex items-center gap-1.5 text-xs text-[#3b82f6] hover:text-[#60a5fa] mt-1">
                            <Plus size={13} /> Adicionar escalão
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Permite devolver duas <tr> por fornecedor sem partir a tabela. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
