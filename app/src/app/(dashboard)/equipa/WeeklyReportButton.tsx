"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FileDown } from "lucide-react";

const iso = (d: Date) => d.toISOString();

type Kind = "optica" | "clinica";

/**
 * Campos De/Até + botões de PDF da Equipa. As datas são a ÚNICA fonte do
 * intervalo do menu Equipa: ao mudá-las, sincroniza-se a URL (?from&to) e o
 * servidor recalcula os dados dos vendedores para esse intervalo (e os PDF usam
 * o mesmo intervalo). Os botões de PDF só aparecem com permissão de exportação;
 * os campos de data aparecem sempre (comandam a página).
 */
export function WeeklyReportButton({ initialFrom, initialTo, canExport }: { initialFrom: string; initialTo: string; canExport: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState<string>(initialFrom);
  const [to, setTo] = useState<string>(initialTo);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Aplica o intervalo na URL → o servidor recalcula os dados da Equipa.
  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom); setTo(nextTo);
    if (nextFrom && nextTo && nextFrom <= nextTo) {
      router.replace(`${pathname}?from=${nextFrom}&to=${nextTo}`, { scroll: false });
    }
  }

  async function gen(kind: Kind) {
    setErr(null);
    if (from > to) { setErr("A data de início tem de ser anterior ou igual à de fim."); return; }
    setBusy(kind);
    try {
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      const fromD = new Date(fy, fm - 1, fd);
      const toD = new Date(ty, tm - 1, td + 1); // dia seguinte (exclusivo) → inclui o dia "Até"
      const url = `/api/reports/weekly-${kind}?from=${encodeURIComponent(iso(fromD))}&to=${encodeURIComponent(iso(toD))}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Erro ${res.status}`);
      const data = await res.json();
      const tag = `${from} a ${to}`;
      if (kind === "optica") {
        const { buildWeeklyOpticaPdf } = await import("@/lib/reports/weekly-optica-pdf");
        buildWeeklyOpticaPdf(data).save(`Individuais Optica ${tag}.pdf`);
      } else {
        const { buildWeeklyClinicaPdf } = await import("@/lib/reports/weekly-clinica-pdf");
        buildWeeklyClinicaPdf(data).save(`Individuais Clinica ${tag}.pdf`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar");
    } finally { setBusy(null); }
  }

  const inp = "bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:border-[#3b82f6] outline-none";
  const btn = "flex items-center gap-2 bg-[#fc4c3b] hover:bg-[#e23d2d] disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-text-muted">De</label>
      <input type="date" value={from} max={to} onChange={(e) => applyRange(e.target.value, to)} className={inp} />
      <label className="text-xs text-text-muted">Até</label>
      <input type="date" value={to} min={from} onChange={(e) => applyRange(from, e.target.value)} className={inp} />
      {canExport && (
        <>
          <button onClick={() => gen("optica")} disabled={!!busy} className={btn}>
            <FileDown size={15} /> {busy === "optica" ? "A gerar…" : "PDF Óptica"}
          </button>
          <button onClick={() => gen("clinica")} disabled={!!busy} className={btn}>
            <FileDown size={15} /> {busy === "clinica" ? "A gerar…" : "PDF Clínica"}
          </button>
        </>
      )}
      {err && <span className="text-xs text-[#ef4444]">{err}</span>}
    </div>
  );
}
