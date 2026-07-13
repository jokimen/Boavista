/**
 * Gerador do relatório SEMANAL de óptica (réplica do template "Individuais").
 * Cliente-side (jsPDF). Recebe os dados de weeklyOpticaReport e desenha 6 páginas.
 */
import { jsPDF } from "jspdf";
import type { WeeklyOpticaReport } from "@/lib/api/visual-map";
import {
  decorHeader, pageNumber, sectionTitle, topThreeBlock, vBarChart, legend,
  rankingRows, fmt, SERIES, NAVY, CORAL, PAGE_W,
} from "./pdf-kit";

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

/** "25 MAIO A 30 MAIO 2026" */
function rangeLabel(fromISO: string, toISO: string): string {
  const f = new Date(fromISO), t = new Date(toISO);
  // `to` é exclusivo (dia seguinte) no nosso modelo → recuar 1 dia para o rótulo
  const tEnd = new Date(t.getTime() - 86400000);
  return `${f.getDate()} ${MESES[f.getMonth()]} A ${tEnd.getDate()} ${MESES[tEnd.getMonth()]} ${tEnd.getFullYear()}`;
}

function text(doc: jsPDF, hex: string) {
  const h = hex.replace("#", "");
  doc.setTextColor(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

export function buildWeeklyOpticaPdf(data: WeeklyOpticaReport): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const range = rangeLabel(data.from, data.to);
  let pg = 0;
  const newPage = (first = false) => { if (!first) doc.addPage(); pg++; };

  // ── P1: Top 3 melhores vendedores (€) ──────────────────────────────────────
  newPage(true);
  decorHeader(doc);
  sectionTitle(doc, ["MELHORES VENDEDORES", "DO PERÍODO", range], 50);
  topThreeBlock(doc, data.sellers.slice(0, 3).map((s) => ({ name: s.name, value: fmt(s.sales, 2), unit: "EUROS" })), 90);
  pageNumber(doc, pg);

  // ── P2: Vendas semanais (nº de vendas por vendedor) ─────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["Vendas do Período", range], 50);
  const sortedByName = [...data.sellers].sort((a, b) => a.name.localeCompare(b.name));
  vBarChart(doc, sortedByName.map((s, i) => ({ label: s.name, value: s.count, color: SERIES[i % SERIES.length] })), { y: 80, h: 95, yLabel: "Nº DE VENDAS" });
  legend(doc, sortedByName.map((s, i) => ({ label: s.name, color: SERIES[i % SERIES.length] })), 195);
  pageNumber(doc, pg);

  // ── P3: Ticket médio por vendedor ───────────────────────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["TICKET MEDIO", range], 50);
  vBarChart(doc, sortedByName.map((s, i) => ({ label: s.name, value: s.ticket, color: SERIES[i % SERIES.length] })), { y: 80, h: 95, yLabel: "TICKET MEDIO" });
  legend(doc, sortedByName.map((s, i) => ({ label: s.name, color: SERIES[i % SERIES.length] })), 195);
  pageNumber(doc, pg);

  // ── P4: Comparativa de faturação semanal (com/sem IVA, 4 anos) ──────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["COMPARATIVA DE FATURAÇÃO", range], 50);
  text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("FATURAÇÃO COM IVA", PAGE_W / 2, 78, { align: "center" });
  vBarChart(doc, data.weekCompare.map((y) => ({ label: String(y.year), value: y.comIva, color: CORAL })), { x: 55, y: 84, w: 100, h: 55 });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); text(doc, NAVY);
  doc.text("FATURAÇÃO SEM IVA", PAGE_W / 2, 172, { align: "center" });
  vBarChart(doc, data.weekCompare.map((y) => ({ label: String(y.year), value: y.semIva, color: CORAL })), { x: 55, y: 178, w: 100, h: 55 });
  pageNumber(doc, pg);

  // ── P5: Comparativa anual (YTD com IVA) ─────────────────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["COMPARATIVA DE FATURAÇÃO", "ANUAL"], 50);
  vBarChart(doc, data.yearCompare.map((y) => ({ label: String(y.year), value: y.comIva, color: CORAL })), { x: 60, y: 90, w: 90, h: 70 });
  text(doc, "#1c1c1c"); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  const sign = data.yearImprovementPct >= 0 ? "+" : "";
  doc.text(`Melhoria atual no ano +/- ${sign}${fmt(data.yearImprovementPct, 1)}%`, PAGE_W / 2, 185, { align: "center" });
  pageNumber(doc, pg);

  // ── P6: Ranking por % de contribuição ───────────────────────────────────────
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["MELHORES VENDEDORES", "DO PERÍODO", range], 50);
  const ranked = [...data.sellers].filter((s) => s.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 8);
  rankingRows(doc, ranked.map((s) => ({ name: s.name, value: `${fmt(s.pct, 2)}%` })), 95);
  pageNumber(doc, pg);

  // ── P7: igual à P6, apenas SEM a linha da Elisa (mesmas % — NÃO recalcular) ──
  newPage(); decorHeader(doc);
  sectionTitle(doc, ["MELHORES VENDEDORES", "DO PERÍODO (SEM ELISA)", range], 50);
  const rankedSemElisa = ranked.filter((s) => !/elisa/i.test(s.name));
  rankingRows(doc, rankedSemElisa.map((s) => ({ name: s.name, value: `${fmt(s.pct, 2)}%` })), 95);
  pageNumber(doc, pg);

  return doc;
}
