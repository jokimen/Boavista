/**
 * Gerador do RELATÓRIO MENSAL (réplica do template). Cliente-side (jsPDF).
 * As páginas com séries por vendedor×categoria (fornecedor de lentes na P6, LC
 * por vendedor na P7) usam `groupedHBarChart` (barras agrupadas, uma por série).
 */
import { jsPDF } from "jspdf";
import type { MonthlyReport } from "@/lib/api/visual-map";
import {
  coverPage, closingPage, decorHeader, pageNumber, sectionTitle, vBarChart, hBarChart,
  groupedHBarChart, topThreeBlock, rankingRows, legend, kpiIcon, fmt, CORAL, NAVY, GREYTXT, SERIES, PAGE_W,
  type KpiIconKind,
} from "./pdf-kit";

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
function endDate(toISO: string) { return new Date(new Date(toISO).getTime() - 86400000); }
function dmy(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; }
function text(doc: jsPDF, hex: string) { const h = hex.replace("#", ""); doc.setTextColor(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)); }

export function buildMonthlyPdf(data: MonthlyReport, author = "Joaquim Oliveira"): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const f = new Date(data.from), end = endDate(data.to);
  const monthName = MESES[f.getMonth()];
  const monthLabel = `${monthName} ${f.getFullYear()}`;
  let pg = 0;
  const page = (draw: () => void, withDecor = true) => { if (pg > 0) doc.addPage(); pg++; if (withDecor) decorHeader(doc); draw(); pageNumber(doc, pg); };
  const byName = <T extends { name?: string; seller?: string }>(a: T, b: T) => String(a.name ?? a.seller).localeCompare(String(b.name ?? b.seller));

  // P1 — Capa
  pg++; coverPage(doc, { title: "Relatório Mensal", subtitle: `DE ${dmy(f)} A ${dmy(end)}`, author, role: "Consultor" });

  // P2 — Índice (ícones + rótulos, réplica do template)
  page(() => {
    sectionTitle(doc, ["Indicadores chave", "mensais"], 55);
    const items: { label: string; kind: KpiIconKind }[] = [
      { label: "Crescimento", kind: "growth" }, { label: "Unidades vendidas", kind: "units" }, { label: "Clientes Novos", kind: "new" },
      { label: "Clientes Fiéis", kind: "loyal" }, { label: "Vendedores TOP", kind: "top" }, { label: "Produtos mais vendidos", kind: "products" },
    ];
    const colX = [45, 105, 165];
    const iconY = [115, 175], labelY = [130, 190];
    items.forEach((it, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      kpiIcon(doc, it.kind, colX[col], iconY[row]);
      text(doc, NAVY); doc.setFont("helvetica", "normal"); doc.setFontSize(13);
      doc.text(it.label, colX[col], labelY[row], { align: "center", maxWidth: 52 });
    });
    // divisória coral entre as duas linhas
    const [r, g, b] = [0xf9, 0x4c, 0x3b]; doc.setDrawColor(r, g, b); doc.setLineWidth(0.6);
    doc.line(28, 150, PAGE_W - 28, 150);
  });

  // P3 — Clientes Novos (faixa etária + seguro)
  page(() => {
    sectionTitle(doc, ["Clientes Novos", monthLabel], 52);
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`Clientes Novos (${data.clientesNovos.total})`, PAGE_W / 2, 80, { align: "center" });
    vBarChart(doc, data.clientesNovos.byAge.map((a, i) => ({ label: a.label, value: a.count, color: SERIES[i % SERIES.length] })), { y: 86, h: 55 });
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("COM SEGURO", PAGE_W / 2, 168, { align: "center" });
    if (data.clientesNovos.bySeguro.length)
      hBarChart(doc, data.clientesNovos.bySeguro.map((s) => ({ label: s.name, value: s.count, color: "#5ad1d1" })), { y: 174, h: 70 });
    else { text(doc, GREYTXT); doc.setFontSize(9); doc.text("Sem seguradoras rotuladas (Admin → Seguradoras).", PAGE_W / 2, 195, { align: "center" }); }
  });

  // P4 — Vendas mensais (nº por vendedor) + valor por tipo
  page(() => {
    sectionTitle(doc, ["Vendas Mensais", monthLabel], 52);
    const s = [...data.sellers].sort(byName);
    const yb = vBarChart(doc, s.map((x, i) => ({ label: x.name, value: x.count, color: SERIES[i % SERIES.length] })), { y: 80, h: 70 });
    legend(doc, s.map((x, i) => ({ label: x.name, color: SERIES[i % SERIES.length] })), yb + 4);
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("VALOR POR TIPO DE PRODUTO", PAGE_W / 2, 188, { align: "center" });
    hBarChart(doc, [
      { label: "ARO", value: data.valorPorTipo.aro }, { label: "SOL", value: data.valorPorTipo.sol },
      { label: "LENTES", value: data.valorPorTipo.lentes }, { label: "LENTES CONTACTO", value: data.valorPorTipo.lc },
    ].map((x) => ({ ...x, color: "#5ad1d1" })), { y: 194, h: 55, labelW: 42 });
  });

  // P5 — Melhores vendedores do mês (top 3)
  page(() => {
    sectionTitle(doc, ["MELHORES VENDEDORES", `DO MÊS ${monthLabel}`], 52);
    topThreeBlock(doc, data.top3.map((t) => ({ name: t.name, value: fmt(t.sales, 2), pct: `${fmt(t.pct, 2)}%`, unit: "EUROS" })), 90);
  });

  // P6 — Vendas por fornecedor (lentes) — barras agrupadas: vendedor × fornecedor
  page(() => {
    sectionTitle(doc, ["VENDAS POR FORNECEDOR - LENTES", monthLabel], 50);
    // Top fornecedores globais (cores fixas + legenda); cada vendedor é um grupo.
    const provTotals = new Map<string, number>();
    for (const s of data.fornecedorLentes) for (const p of s.providers) provTotals.set(p.name, (provTotals.get(p.name) ?? 0) + p.count);
    const topProv = [...provTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
    if (topProv.length && data.fornecedorLentes.length) {
      // Paleta distinta (séries lado a lado precisam de cores bem separadas).
      const PALETTE = ["#5ad1d1", "#5b3f7a", "#f4a64b", "#f1693f", "#a8423f", "#2f6f9f"];
      const series = topProv.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] }));
      const groups = [...data.fornecedorLentes].sort(byName).map((s) => ({
        label: s.seller,
        values: topProv.map((pn) => s.providers.find((p) => p.name === pn)?.count ?? 0),
      }));
      groupedHBarChart(doc, groups, series, { y: 85, h: 155, xLabel: "Nº DE VENDAS", yLabel: "VENDEDORES" });
    } else { text(doc, GREYTXT); doc.setFontSize(11); doc.text("Sem vendas de lentes no período.", PAGE_W / 2, 120, { align: "center" }); }
  });

  // P7 — LC por vendedor (grupos × diária/mensal/outras) + gama de LC
  page(() => {
    sectionTitle(doc, ["TIPO DE LC MAIS VENDIDAS", monthLabel], 48);
    const lcSeries = [{ name: "DIÁRIAS", color: "#5ad1d1" }, { name: "MENSAIS", color: NAVY }, { name: "OUTRAS", color: "#f4a64b" }];
    const lcGroups = [...data.lcPorVendedor].filter((s) => s.diaria + s.mensal + s.outras > 0).sort(byName)
      .map((s) => ({ label: s.seller, values: [s.diaria, s.mensal, s.outras] }));
    if (lcGroups.length) groupedHBarChart(doc, lcGroups, lcSeries, { y: 70, h: 95, xLabel: "Nº DE VENDAS", yLabel: "VENDEDORES" });
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("GAMA DE LC", PAGE_W / 2, 182, { align: "center" });
    hBarChart(doc, data.lcGama.map((g) => ({ label: g.tipo, value: g.count, color: "#5ad1d1" })), { y: 188, h: 90, labelW: 32 });
  });

  // P8 — Saúde ocular: GAMA DE SAÚDE OCULAR (tipo × marca, barras agrupadas)
  page(() => {
    sectionTitle(doc, ["SAÚDE OCULAR + VENDIDA", monthLabel], 50);
    const brandTotals = new Map<string, number>();
    for (const t of data.saudeGama) for (const b of t.brands) brandTotals.set(b.name, (brandTotals.get(b.name) ?? 0) + b.count);
    const topBrands = [...brandTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
    const hasOutros = [...brandTotals.keys()].some((n) => !topBrands.includes(n));
    const PALETTE = ["#5ad1d1", "#5b3f7a", "#f4a64b", "#f1693f", "#a8423f", "#2f6f9f", "#f4cf2e"];
    const seriesNames = hasOutros ? [...topBrands, "Outros"] : topBrands;
    if (data.saudeGama.length && seriesNames.length) {
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("GAMA DE SAÚDE OCULAR", PAGE_W / 2, 80, { align: "center" });
      const series = seriesNames.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] }));
      const groups = data.saudeGama.map((t) => ({
        label: t.tipo,
        values: seriesNames.map((sn) => sn === "Outros"
          ? t.brands.filter((b) => !topBrands.includes(b.name)).reduce((s, b) => s + b.count, 0)
          : (t.brands.find((b) => b.name === sn)?.count ?? 0)),
      }));
      groupedHBarChart(doc, groups, series, { y: 92, h: 130, xLabel: "QUANTIDADE", yLabel: "TIPO" });
    } else { text(doc, GREYTXT); doc.setFontSize(11); doc.text("Sem vendas de saúde ocular no período.", PAGE_W / 2, 110, { align: "center" }); }
  });

  // P9 — % média de desconto (por vendedor + por seguro)
  page(() => {
    sectionTitle(doc, ["% MÉDIA DE DESCONTO", monthLabel], 52);
    const ybd = vBarChart(doc, data.sellerDiscount.map((x, i) => ({ label: x.name, value: x.pct, color: SERIES[i % SERIES.length] })), { y: 80, h: 60 });
    legend(doc, data.sellerDiscount.map((x, i) => ({ label: x.name, color: SERIES[i % SERIES.length] })), ybd + 4);
    if (data.descPorSeguro.length) {
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("% MEDIA DESC SEGUROS", PAGE_W / 2, 182, { align: "center" });
      hBarChart(doc, data.descPorSeguro.map((s) => ({ label: s.name, value: s.pct, color: "#5ad1d1" })), { y: 188, h: 55 });
    }
  });

  // P9b — Comparticipação de seguros (€ que a seguradora abate na fatura)
  page(() => {
    sectionTitle(doc, ["COMPARTICIPAÇÃO DE SEGUROS", monthLabel], 50);
    if (data.eurPorSeguro.length) {
      const total = data.eurPorSeguro.reduce((s, x) => s + x.eur, 0);
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(`TOTAL COMPARTICIPADO: ${fmt(total, 2)} €`, PAGE_W / 2, 82, { align: "center" });
      hBarChart(doc, data.eurPorSeguro.map((s) => ({ label: s.name, value: s.eur, color: "#5ad1d1" })),
        { y: 92, h: 150, labelW: 45, valueFmt: (n) => `${fmt(n, 0)} €` });
    } else {
      text(doc, GREYTXT); doc.setFontSize(11);
      doc.text("Sem comparticipações de seguradoras rotuladas no período.", PAGE_W / 2, 110, { align: "center" });
    }
  });

  // P10 — Nº de orçamentos
  page(() => {
    sectionTitle(doc, ["Nº DE ORÇAMENTOS", monthLabel], 52);
    const o = [...data.orcamentos].sort(byName);
    const ybo = vBarChart(doc, o.map((x, i) => ({ label: x.name, value: x.count, color: SERIES[i % SERIES.length] })), { y: 85, h: 90 });
    legend(doc, o.map((x, i) => ({ label: x.name, color: SERIES[i % SERIES.length] })), ybo + 4);
  });

  // P11 — Aparelhos auditivos (vendedor € + MARCAS APARELHOS por quantidade)
  page(() => {
    sectionTitle(doc, ["VENDA DE APARELHOS AUD", monthLabel], 50);
    if (data.aparelhos.length) {
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("APARELHOS AUDITIVOS", PAGE_W / 2, 80, { align: "center" });
      hBarChart(doc, data.aparelhos.map((a) => ({ label: a.seller, value: a.total, color: "#5ad1d1" })), { y: 88, h: 58, labelW: 40, valueFmt: (n) => fmt(n, 0) });
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("MARCAS APARELHOS", PAGE_W / 2, 168, { align: "center" });
      if (data.aparelhosBrands.length)
        hBarChart(doc, data.aparelhosBrands.map((b, i) => ({ label: b.brand, value: b.count, color: SERIES[i % SERIES.length] })), { y: 176, h: 80, labelW: 40 });
    } else { text(doc, GREYTXT); doc.setFontSize(11); doc.text("Sem vendas de aparelhos auditivos no período.", PAGE_W / 2, 120, { align: "center" }); }
  });

  // P12 — Vendas aros/sol por marca
  page(() => {
    sectionTitle(doc, ["VENDAS AROS/SOL", monthLabel], 52);
    hBarChart(doc, data.arosSolBrands.map((b, i) => ({ label: b.brand, value: b.count, color: SERIES[i % SERIES.length] })), { y: 85, h: 150, labelW: 35 });
  });

  // P12b — Compras mensais (unidades rececionadas por tipo: ARO/SOL/LC/LENTES)
  page(() => {
    sectionTitle(doc, ["COMPRAS MENSAIS", monthLabel], 52);
    const compras = data.comprasPorTipo.filter((c) => c.qty > 0);
    if (compras.length) {
      const total = compras.reduce((s, x) => s + x.qty, 0);
      const COMPRAS_COLORS: Record<string, string> = { ARO: "#5ad1d1", SOL: "#5b3f7a", LC: "#f4a64b", LENTES: "#f1693f" };
      text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(`TOTAL DE UNIDADES: ${fmt(total, 0)}`, PAGE_W / 2, 84, { align: "center" });
      hBarChart(doc, compras.map((c) => ({ label: c.tipo, value: c.qty, color: COMPRAS_COLORS[c.tipo] ?? CORAL })),
        { y: 96, h: 110, labelW: 55, valueFmt: (n) => fmt(n, 0) });
    } else {
      text(doc, GREYTXT); doc.setFontSize(11);
      doc.text("Sem compras de fornecedores no período.", PAGE_W / 2, 110, { align: "center" });
    }
  });

  // P13 — Comparativa de vendas (com/sem IVA, 4 anos)
  page(() => {
    sectionTitle(doc, ["COMPARATIVA DE VENDAS"], 52);
    text(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("VENDAS COM IVA", PAGE_W / 2, 80, { align: "center" });
    vBarChart(doc, data.monthCompare.map((y) => ({ label: String(y.year), value: y.comIva, color: CORAL })), { x: 55, y: 86, w: 100, h: 55 });
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); text(doc, NAVY);
    doc.text("VENDAS SEM IVA", PAGE_W / 2, 174, { align: "center" });
    vBarChart(doc, data.monthCompare.map((y) => ({ label: String(y.year), value: y.semIva, color: CORAL })), { x: 55, y: 180, w: 100, h: 55 });
  });

  // P14 — Comparativa anual
  page(() => {
    sectionTitle(doc, ["COMPARATIVA DE VENDAS"], 52);
    vBarChart(doc, data.yearCompare.map((y) => ({ label: String(y.year), value: y.comIva, color: CORAL })), { x: 60, y: 90, w: 90, h: 70 });
    text(doc, CORAL); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    const sign = data.yearImprovementPct >= 0 ? "+" : "";
    doc.text(`Melhoria Anual +/- ${sign}${fmt(data.yearImprovementPct, 1)}%`, PAGE_W / 2, 185, { align: "center" });
  });

  // P15 — Ticket médio
  page(() => {
    sectionTitle(doc, ["TICKET MEDIO"], 52);
    const t = [...data.ticket].sort(byName);
    const ybt = vBarChart(doc, t.map((x, i) => ({ label: x.name, value: x.ticket, color: SERIES[i % SERIES.length] })), { y: 85, h: 90 });
    legend(doc, t.map((x, i) => ({ label: x.name, color: SERIES[i % SERIES.length] })), ybt + 4);
  });

  // P16 — Dados mensais (ranking %)
  page(() => {
    sectionTitle(doc, ["DADOS MENSAIS", monthLabel], 52);
    rankingRows(doc, [...data.ranking].sort((a, b) => b.pct - a.pct).slice(0, 8).map((r) => ({ name: r.name, value: fmt(r.pct, 2) })), 90);
  });

  // P17 — Próximos passos
  page(() => {
    sectionTitle(doc, ["PRÓXIMOS", "PASSOS"], 70);
    const steps = ["Analisar perfil de clientes", "Analisar performance dos vendedores", "Analisar produtos vendidos", "Analisar vendas/compras e margens"];
    text(doc, GREYTXT); doc.setFont("helvetica", "normal"); doc.setFontSize(13);
    steps.forEach((s, i) => doc.text(`›  ${s}`, 40, 120 + i * 18));
  });

  // P18 — Contracapa
  pg++; doc.addPage(); closingPage(doc);

  return doc;
}
