import { NextResponse } from "next/server";
import { requireModule } from "@/lib/auth/guard";
import { articleMovements, stockByStore } from "@/lib/api/odata-map";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  // Exige permissão de visualização do módulo Stock (não basta estar autenticado).
  await requireModule("stock");

  const safe = String(codigo).replace(/[^0-9A-Za-z]/g, "").slice(0, 20);
  if (!safe) return NextResponse.json({ error: "Código inválido" }, { status: 400 });

  try {
    const [movements, stores] = await Promise.all([articleMovements(safe), stockByStore(safe)]);
    return NextResponse.json({ movements, stores });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
