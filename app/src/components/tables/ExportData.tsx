"use client";

import { ExportButtons } from "./ExportButtons";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/export/exporters";

interface ExportDataProps {
  /** Nome base do ficheiro e título do PDF. */
  title: string;
  columns: ExportColumn[];
  /** Linhas já carregadas (qualquer objeto; acede-se por `column.key`). */
  rows: readonly object[];
  /** Se false, não mostra os botões (sem permissão de exportar). */
  canExport?: boolean;
}

/**
 * Botões de exportação prontos a usar: recebem os dados já carregados (do server
 * component) e geram Excel/PDF no browser. Respeita a permissão `canExport`.
 */
export function ExportData({ title, columns, rows, canExport = true }: ExportDataProps) {
  if (!canExport) return null;
  const data = rows as Record<string, unknown>[];
  return (
    <ExportButtons
      disabled={rows.length === 0}
      onExportExcel={async () => exportToExcel(title, title, columns, data)}
      onExportPdf={async () => exportToPdf(title, columns, data)}
    />
  );
}
