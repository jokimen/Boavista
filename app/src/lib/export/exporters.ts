/**
 * Utilitários de exportação (Excel e PDF), executados no browser.
 * Usar apenas a partir de componentes client.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportColumn {
  key: string;
  label: string;
}

type Row = Record<string, unknown>;

const cell = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();

/** Exporta linhas para um ficheiro .xlsx usando os rótulos das colunas. */
export async function exportToExcel(filename: string, sheetName: string, columns: ExportColumn[], rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || "Dados");
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(12, c.label.length + 2)) }));
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, cell(r[c.key])])));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(filename)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Exporta linhas para um PDF com título, data e tabela. */
export function exportToPdf(title: string, columns: ExportColumn[], rows: Row[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Óptica Boavista · ${new Date().toLocaleString("pt-PT")}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => cell(r[c.key]))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [243, 244, 246] },
  });
  doc.save(`${slug(title)}.pdf`);
}
