import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { ExportData } from "@/components/tables/ExportData";
import { canExport } from "@/lib/auth/permissions";
import { fetchStock } from "@/lib/api/adapter";
import { StockOverview } from "./StockOverview";
import { BrandAnalysis } from "./BrandAnalysis";
import { brandList } from "@/lib/stock/brand-analytics";

export default async function StockPage() {
  const session = await requireModule("stock");
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Stock e Rentabilidade" subtitle="Capital empatado, rotação e produtos parados" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar stock (catálogo + entradas)…</div>}>
          <StockContent canExportStock={canExport(session.permissions, "stock")} />
        </Suspense>
      </div>
    </div>
  );
}

async function StockContent({ canExportStock }: { canExportStock: boolean }) {
  const { summary, items } = await fetchStock();

  return (
    <>
        <div className="flex justify-end">
          <ExportData
            title="Stock"
            canExport={canExportStock}
            columns={[
              { key: "brand", label: "Marca" },
              { key: "model", label: "Modelo" },
              { key: "category", label: "Categoria" },
              { key: "cost", label: "Custo" },
              { key: "price", label: "PVP" },
              { key: "margin_pct", label: "Margem %" },
              { key: "quantity", label: "Qtd." },
              { key: "days_without_sale", label: "Dias sem venda" },
              { key: "last_sale_date", label: "Última venda" },
            ]}
            rows={items}
          />
        </div>
        <StockOverview summary={summary} items={items} />

        <BrandAnalysis brands={brandList(items, ["armacoes", "oculos_sol"])} />
    </>
  );
}
