/**
 * Gerador do relatório SEMANAL da clínica (réplica do template "Individuais Clinica").
 * Cliente-side (jsPDF). 3 páginas: top optometristas (nº originadas), top faturação,
 * e % peso por setor (optometria / contactologia / total).
 */
import { jsPDF } from "jspdf";
import type { WeeklyClinicaReport } from "@/lib/api/visual-map";
import { decorHeader, pageNumber, sectionTitle, topThreeBlock, vBarChart, fmt, CORAL, NAVY, PAGE_W } from "./pdf-kit";

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
function rangeLabel(fromISO: string, toISO: string): string {
  const f = new Date(fromISO), t = new Date(new Date(toISO).getTime() - 86400000);
  return `${f.getDate()} ${MESES[f.getMonth()]} A ${t.getDate()} ${MESES[t.getMonth()]} ${t.getFullYear()}`;
}
function text(doc: jsPDF, hex: string) {
  const h = hex.replace("#", "");
  doc.setTextColor(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

export function buildWeeklyClinicaPdf(data: WeeklyClinicaReport): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const range = rangeLabel(data.from, data.to);
  let pg = 0;
  const newPage = (first = false) => { if (!first) doc.addPage(); pg++; };

  // ── P1: Top optometristas por nº de vendas originadas ───────────────────────
  newPage(true); decorHeader(doc);
  sectionTitle(doc, ["TOP OPTOMETRISTAS Nº", "DE VENDAS ORIGINADAS", range], 50);
  topThreeBlock(doc, data.topByCount.map((o) => ({ name: o.name, value: String(o.originated) })), 90);
  pageNumber(doc, pg);

  // ── P2: Top optometristas por volume de faturação ───────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["TOP OPT VOL. FATURAÇÃO", range], 50);
  topThreeBlock(doc, data.topByValue.map((o) => ({ name: o.name, value: fmt(o.faturacao, 2), unit: "EUROS" })), 90);
  pageNumber(doc, pg);

  // ── P3: Dados clínica — % peso por setor ────────────────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["DADOS CLINICA", range], 50);
  const mini = (title: string, rows: { name: string; pct: number }[], x: number, y: number) => {
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(title, x + 35, y - 6, { align: "center" });
    vBarChart(doc, rows.map((r) => ({ label: r.name, value: r.pct, color: CORAL })), { x, y, w: 70, h: 45 });
  };
  mini("OPTOMETRIA", data.sectors.optometria, 20, 90);
  mini("CONTACTOLOGIA", data.sectors.contactologia, PAGE_W - 95, 90);
  mini("TOTAL", data.sectors.total, (PAGE_W - 70) / 2, 165);
  pageNumber(doc, pg);

  return doc;
}
