import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TopBar } from "@/components/layout/TopBar";
import { aseguradoraCodesInUse } from "@/lib/api/visual-map";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";
import { SeguradoraConfigForm } from "./SeguradoraConfigForm";

export const maxDuration = 120; // a leitura REST das faturas (vários meses) é lenta

export default async function AdminSeguradorasPage() {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Seguradoras" subtitle="Rotular os códigos de seguradora do Visual (Multicare, Medis, …)" backHref="/admin" />
      <div className="flex-1 overflow-auto p-6">
        <Suspense fallback={<div className="text-sm text-text-muted">A procurar códigos de seguradora em uso (últimos 12 meses)…</div>}>
          <SeguradorasContent />
        </Suspense>
      </div>
    </div>
  );
}

async function SeguradorasContent() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).toISOString();
  const [inUse, config] = await Promise.all([
    aseguradoraCodesInUse(from, now.toISOString()),
    getAseguradoraConfig({ admin: true }),
  ]);
  // junta códigos em uso + já configurados (para não perder rótulos de códigos antigos)
  const info = new Map(inUse.map((c) => [c.codigo, c]));
  const codes = [...new Set([...inUse.map((c) => c.codigo), ...Object.keys(config)])]
    .sort((a, b) => (info.get(b)?.count ?? 0) - (info.get(a)?.count ?? 0) || Number(a) - Number(b))
    .map((codigo) => ({
      codigo,
      count: info.get(codigo)?.count ?? 0,
      sampleBenef: info.get(codigo)?.sampleBenef ?? "",
      sampleClient: info.get(codigo)?.sampleClient ?? "",
      suggestion: info.get(codigo)?.suggestion ?? "",
    }));

  return <SeguradoraConfigForm codes={codes} config={config} />;
}
