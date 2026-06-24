/**
 * Exportação da análise por vendedor (Excel multi-folha + PDF multi-tabela).
 * Executado no browser (a partir de um componente client).
 */
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { EmployeeAnalytics } from "@/lib/api/visual-map";

export interface EmployeeExportPayload {
  name: string;
  periodLabel: string;
  current: EmployeeAnalytics;
  previous: EmployeeAnalytics;
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();

const eur = (n: number) => Math.round(n);
const vpct = (cur: number, prev: number): string => {
  if (prev <= 0) return cur > 0 ? "novo" : "—";
  const d = Math.round(((cur - prev) / prev) * 100);
  return `${d > 0 ? "+" : ""}${d}%`;
};
const convRate = (a: EmployeeAnalytics) => (a.quotes_made > 0 ? Math.round((a.quotes_converted / a.quotes_made) * 100) : 0);

/** Linhas do resumo: métrica | atual | ano anterior | variação. */
function summaryRows({ current: c, previous: p }: EmployeeExportPayload) {
  const r = (metrica: string, cur: number, prev: number, unidade = "") => ({
    metrica, atual: cur, ano_anterior: prev, variacao: vpct(cur, prev), unidade,
  });
  return [
    r("Vendas", eur(c.total_sales), eur(p.total_sales), "€"),
    r("ROI (margem gerada)", eur(c.margin_eur), eur(p.margin_eur), "€"),
    r("Margem", c.margin_pct, p.margin_pct, "%"),
    r("Ticket médio", eur(c.avg_ticket), eur(p.avg_ticket), "€"),
    r("Nº de vendas", c.num_ventas, p.num_ventas, ""),
    r("Unidades", c.total_qty, p.total_qty, ""),
    r("Armações (valor)", eur(c.frames_sales), eur(p.frames_sales), "€"),
    r("Armações (unidades)", c.frames_qty, p.frames_qty, ""),
    r("Óculos de sol (valor)", eur(c.sun_sales), eur(p.sun_sales), "€"),
    r("Óculos de sol (unidades)", c.sun_qty, p.sun_qty, ""),
    r("Lentes monofocais", c.lens_mono, p.lens_mono, "un."),
    r("Lentes progressivas", c.lens_prog, p.lens_prog, "un."),
    r("Lentes bifocais", c.lens_bifo, p.lens_bifo, "un."),
    r("Orçamentos feitos", c.quotes_made, p.quotes_made, ""),
    r("Orçamentos convertidos", c.quotes_converted, p.quotes_converted, ""),
    r("Taxa de conversão", convRate(c), convRate(p), "%"),
  ];
}

export async function exportEmployeeExcel(payload: EmployeeExportPayload) {
  const { name, periodLabel, current: c } = payload;
  const wb = new ExcelJS.Workbook();

  const resumo = wb.addWorksheet("Resumo");
  resumo.mergeCells("A1:E1");
  resumo.getCell("A1").value = `Análise do vendedor — ${name}`;
  resumo.getCell("A1").font = { bold: true, size: 14 };
  resumo.mergeCells("A2:E2");
  resumo.getCell("A2").value = `Óptica Boavista · ${periodLabel} · comparação com o ano anterior`;
  resumo.getCell("A2").font = { color: { argb: "FF6B7280" }, size: 10 };
  resumo.addRow([]);
  resumo.addRow(["Métrica", "Unidade", "Atual", "Ano anterior", "Variação"]);
  resumo.getRow(4).font = { bold: true };
  for (const s of summaryRows(payload)) resumo.addRow([s.metrica, s.unidade, s.atual, s.ano_anterior, s.variacao]);
  resumo.columns = [{ width: 26 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 12 }];

  const marcas = wb.addWorksheet("Marcas");
  marcas.addRow(["Marca", "Unidades", "Vendas (€)"]).font = { bold: true };
  for (const b of c.top_brands) marcas.addRow([b.label, b.qty, eur(b.sales)]);
  marcas.columns = [{ width: 30 }, { width: 12 }, { width: 14 }];

  const forn = wb.addWorksheet("Fornecedores");
  forn.addRow(["Fornecedor", "Unidades", "Vendas (€)", "Peso %"]).font = { bold: true };
  for (const s of c.top_suppliers) forn.addRow([s.label, s.qty, eur(s.sales), s.pct]);
  forn.columns = [{ width: 30 }, { width: 12 }, { width: 14 }, { width: 10 }];

  const pend = wb.addWorksheet("Por entregar");
  pend.addRow(["Venda", "Data", "Produto", "Unidades", "Estado"]).font = { bold: true };
  for (const x of c.pending) pend.addRow([x.ref, x.date, x.desc, x.qty, x.estado]);
  pend.columns = [{ width: 16 }, { width: 12 }, { width: 40 }, { width: 10 }, { width: 18 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analise_vendedor_${slug(name)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportEmployeePdf(payload: EmployeeExportPayload) {
  const { name, periodLabel, current: c } = payload;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Análise do vendedor — ${name}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Óptica Boavista · ${periodLabel} · comparação com o ano anterior`, 14, 22);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jspdf-autotable anexa lastAutoTable em runtime
  const lastY = () => (doc as any).lastAutoTable?.finalY ?? 28;
  const section = (title: string, head: string[], body: (string | number)[][], startY: number) => {
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text(title, 14, startY);
    autoTable(doc, {
      startY: startY + 3,
      head: [head],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
      alternateRowStyles: { fillColor: [243, 244, 246] },
    });
  };

  section("Resumo (vs ano anterior)", ["Métrica", "Un.", "Atual", "Ano ant.", "Var."],
    summaryRows(payload).map((s) => [s.metrica, s.unidade, String(s.atual), String(s.ano_anterior), s.variacao]), 30);

  if (c.top_brands.length)
    section("Marcas que mais vende", ["Marca", "Unidades", "Vendas (€)"],
      c.top_brands.map((b) => [b.label, b.qty, eur(b.sales)]), lastY() + 10);

  if (c.top_suppliers.length)
    section("Peso por fornecedor", ["Fornecedor", "Unidades", "Vendas (€)", "Peso %"],
      c.top_suppliers.map((s) => [s.label, s.qty, eur(s.sales), `${s.pct}%`]), lastY() + 10);

  if (c.pending.length)
    section(`Vendas por entregar (${c.pending.length})`, ["Venda", "Data", "Produto", "Un.", "Estado"],
      c.pending.map((x) => [x.ref, x.date, x.desc, x.qty, x.estado]), lastY() + 10);

  doc.save(`analise_vendedor_${slug(name)}.pdf`);
}
