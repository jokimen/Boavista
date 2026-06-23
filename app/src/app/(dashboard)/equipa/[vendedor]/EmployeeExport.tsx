"use client";

import { ExportButtons } from "@/components/tables/ExportButtons";
import { exportEmployeeExcel, exportEmployeePdf, type EmployeeExportPayload } from "@/lib/export/employee-export";

/** Botões Excel/PDF para a análise do vendedor (Resumo + Marcas + Fornecedores + Por entregar). */
export function EmployeeExport({ payload, canExport = true }: { payload: EmployeeExportPayload; canExport?: boolean }) {
  if (!canExport) return null;
  return (
    <ExportButtons
      onExportExcel={async () => exportEmployeeExcel(payload)}
      onExportPdf={async () => exportEmployeePdf(payload)}
    />
  );
}
