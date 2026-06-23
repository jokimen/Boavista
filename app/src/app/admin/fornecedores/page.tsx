import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TopBar } from "@/components/layout/TopBar";
import { listSuppliers, supplierPurchases, isOdataConfigured } from "@/lib/api/odata-map";
import { getSupplierConfig } from "@/lib/suppliers/store";
import { SupplierConfigForm } from "./SupplierConfigForm";

export default async function AdminFornecedoresPage() {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  if (!isOdataConfigured()) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Fornecedores" subtitle="Configuração de grupos, objetivos e rappel" backHref="/admin" />
        <div className="p-6 text-sm text-text-secondary">OData não configurado.</div>
      </div>
    );
  }

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [suppliers, config, purchasesList] = await Promise.all([
    listSuppliers(),
    getSupplierConfig(),
    supplierPurchases(yearStart.toISOString(), now.toISOString()).catch(() => []),
  ]);
  const purchases: Record<string, number> = {};
  for (const p of purchasesList) purchases[p.proveedor] = p.total;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Fornecedores" subtitle="Grupo, objetivo de compra e rappel por escalões" backHref="/admin" />
      <div className="flex-1 overflow-auto p-6">
        <SupplierConfigForm suppliers={suppliers} config={config} purchases={purchases} purchasesYear={now.getFullYear()} />
      </div>
    </div>
  );
}
