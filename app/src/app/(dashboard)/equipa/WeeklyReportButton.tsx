"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().split("T")[0];

type Kind = "optica" | "clinica";

export function WeeklyReportButton() {
  // por defeito: últimos 7 dias (até ontem)
  const [from, setFrom] = useState<string>(() => ymd(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState<string>(() => ymd(new Date(Date.now() - 86400000)));
  const [busy, setBusy] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inp} />
      <label className="text-xs text-text-muted">Até</label>
      <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inp} />
      <button onClick={() => gen("optica")} disabled={!!busy} className={btn}>
        <FileDown size={15} /> {busy === "optica" ? "A gerar…" : "PDF Óptica"}
      </button>
      <button onClick={() => gen("clinica")} disabled={!!busy} className={btn}>
        <FileDown size={15} /> {busy === "clinica" ? "A gerar…" : "PDF Clínica"}
      </button>
      {err && <span className="text-xs text-[#ef4444]">{err}</span>}
    </div>
  );
}
