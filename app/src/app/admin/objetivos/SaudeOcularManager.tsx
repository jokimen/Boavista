"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, HeartPulse } from "lucide-react";

type Product = { codigo: string; descricao: string | null };

/** Converte as linhas do textarea (`codigo` ou `codigo,descrição` / `codigo  descrição`) em produtos. */
function parseLines(text: string): Product[] {
  const out: Product[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // separa por vírgula, tab ou múltiplos espaços
    const m = t.match(/^(\S+)(?:[,\t]\s*|\s{2,})?(.*)$/);
    if (!m) continue;
    out.push({ codigo: m[1], descricao: m[2]?.trim() || null });
  }
  return out;
}

export function SaudeOcularManager({ products }: { products: Product[] }) {
  const router = useRouter();
  const [text, setText] = useState(
    products.map((p) => (p.descricao ? `${p.codigo}, ${p.descricao}` : p.codigo)).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const parsed = parseLines(text);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/saude-ocular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: parsed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao guardar");
      }
      const j = await res.json();
      setMsg({ type: "ok", text: `Lista guardada (${j.count} códigos).` });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <HeartPulse size={16} className="text-[#ec4899]" />
        <h3 className="text-sm font-semibold text-text-primary">Produtos de Saúde Ocular</h3>
      </div>
      <p className="text-xs text-text-muted">
        Códigos de produto (campo <code className="text-text-secondary">Codigo</code> do Visual) considerados
        saúde ocular — lágrimas artificiais, líquidos de manutenção, etc. Um por linha; opcionalmente
        <code className="text-text-secondary"> codigo, descrição</code>. Guardar <strong>substitui</strong> a lista inteira.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={"152716, Lágrimas Artificiais 10ml\n0000000212, Líquido de manutenção"}
        className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:border-[#3b82f6] outline-none resize-y"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Save size={15} /> {saving ? "A guardar…" : "Guardar lista"}
        </button>
        <span className="text-xs text-text-muted">{parsed.length} código(s)</span>
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
