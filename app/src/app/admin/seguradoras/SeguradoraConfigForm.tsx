"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Wand2 } from "lucide-react";
import type { AseguradoraConfig } from "@/lib/aseguradoras/constants";

type Code = { codigo: string; count: number; sampleBenef?: string; sampleClient?: string; suggestion?: string };
type Row = { codigo: string; nome: string; ativo: boolean; count: number; sampleBenef: string; sampleClient: string; suggestion: string };

export function SeguradoraConfigForm({ codes, config }: { codes: Code[]; config: AseguradoraConfig }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    codes.map((c) => ({
      codigo: c.codigo,
      nome: config[c.codigo]?.nome ?? "",
      ativo: config[c.codigo]?.ativo ?? true,
      count: c.count,
      sampleBenef: c.sampleBenef ?? "",
      sampleClient: c.sampleClient ?? "",
      suggestion: c.suggestion ?? "",
    })),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const set = (codigo: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.codigo === codigo ? { ...r, ...patch } : r)));

  /** Preenche o nome de todas as linhas AINDA vazias com a respetiva sugestão. */
  const applyAllSuggestions = () =>
    setRows((rs) => rs.map((r) => (!r.nome.trim() && r.suggestion ? { ...r, nome: r.suggestion } : r)));

  const pendingSuggestions = rows.filter((r) => !r.nome.trim() && r.suggestion).length;

  async function save() {
    setSaving(true); setMsg(null);
    const payload = rows.map((r) => ({ codigo: r.codigo, nome: r.nome.trim(), ativo: r.ativo }));
    try {
      const res = await fetch("/api/admin/aseguradoras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aseguradoras: payload }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Falha");
      const j = await res.json();
      setMsg({ type: "ok", text: `Guardado (${j.count} seguradoras rotuladas).` });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-muted max-w-2xl">
          A API do Visual só dá o <strong>código</strong> da seguradora, não o nome. Mas nas faturas de
          <strong> reembolso</strong> o cliente é a própria seguradora, por isso sugerimos o
          <strong> nome de cliente dominante</strong> de cada código (Multicare, Medis, Allianz…). Confirma a
          sugestão (chip azul) ou usa “Aplicar sugestões”. Os códigos que só faturam ao paciente não têm sugestão —
          usa o <strong>nº de beneficiário</strong>/<strong>cliente</strong> de exemplo para os identificar no Visual.
          Os que ficarem sem nome aparecem nos relatórios como “Seguro [código]”.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {pendingSuggestions > 0 && (
            <button onClick={applyAllSuggestions} type="button"
              className="flex items-center gap-2 bg-bg-elevated hover:bg-bg-card-hover border border-border text-text-primary text-sm font-medium px-3 py-2 rounded-lg"
              title="Preenche os nomes vazios com o nome de cliente dominante de cada código">
              <Wand2 size={15} /> Aplicar sugestões ({pendingSuggestions})
            </button>
          )}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Save size={15} /> {saving ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </div>
      {msg && <p className={`text-xs ${msg.type === "ok" ? "text-[#10b981]" : "text-[#ef4444]"}`}>{msg.text}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">Não foram encontrados códigos de seguradora nas faturas dos últimos 12 meses.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="py-2 pr-3 w-16">Código</th>
                <th className="py-2 px-2 w-16">Faturas</th>
                <th className="py-2 px-2">Ex. beneficiário</th>
                <th className="py-2 px-2">Ex. cliente</th>
                <th className="py-2 px-2 w-44">Nome da seguradora</th>
                <th className="py-2 px-2 w-14">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codigo} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-text-secondary">{r.codigo}</td>
                  <td className="py-1.5 px-2 text-text-muted">{r.count || "—"}</td>
                  <td className="py-1.5 px-2 font-mono text-text-secondary text-xs">{r.sampleBenef || "—"}</td>
                  <td className="py-1.5 px-2 text-text-secondary text-xs truncate max-w-[180px]" title={r.sampleClient}>{r.sampleClient || "—"}</td>
                  <td className="py-1.5 px-2">
                    <input value={r.nome} onChange={(e) => set(r.codigo, { nome: e.target.value })}
                      placeholder="ex.: Multicare"
                      className="w-full bg-bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:border-[#3b82f6] outline-none" />
                    {r.suggestion && r.nome.trim() !== r.suggestion && (
                      <button type="button" onClick={() => set(r.codigo, { nome: r.suggestion })}
                        title="Usar esta sugestão (nome de cliente dominante)"
                        className="mt-1 inline-flex items-center gap-1 max-w-full text-[11px] text-[#3b82f6] hover:underline truncate">
                        <Wand2 size={11} className="shrink-0" /> <span className="truncate">{r.suggestion}</span>
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="checkbox" checked={r.ativo} onChange={(e) => set(r.codigo, { ativo: e.target.checked })}
                      className="accent-[#3b82f6] w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
