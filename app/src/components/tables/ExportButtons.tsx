"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportButtonsProps {
  onExportExcel?: () => Promise<void>;
  onExportPdf?: () => Promise<void>;
  disabled?: boolean;
}

export function ExportButtons({ onExportExcel, onExportPdf, disabled }: ExportButtonsProps) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  async function handleExcel() {
    if (!onExportExcel) return;
    setLoadingExcel(true);
    try { await onExportExcel(); } finally { setLoadingExcel(false); }
  }

  async function handlePdf() {
    if (!onExportPdf) return;
    setLoadingPdf(true);
    try { await onExportPdf(); } finally { setLoadingPdf(false); }
  }

  return (
    <div className="flex items-center gap-2">
      {onExportExcel && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExcel}
          loading={loadingExcel}
          disabled={disabled}
        >
          <FileSpreadsheet size={14} />
          Excel
        </Button>
      )}
      {onExportPdf && (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePdf}
          loading={loadingPdf}
          disabled={disabled}
        >
          <FileText size={14} />
          PDF
        </Button>
      )}
    </div>
  );
}
