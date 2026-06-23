import { NextResponse } from "next/server";
import { requireModule } from "@/lib/auth/guard";
import { fetchStock } from "@/lib/api/adapter";
import { getBrandHistorySnapshot } from "@/lib/snapshots/heavy";
import { buildBrandAnalysis } from "@/lib/stock/brand-analytics";

export const maxDuration = 60;

/** Análise detalhada de uma marca: stock + vendido/comprado 4 anos + repartições. */
export async function GET(req: Request) {
  await requireModule("stock"); // exige can_view de Stock

  const marca = (new URL(req.url).searchParams.get("marca") ?? "").trim();
  if (!marca) return NextResponse.json({ error: "Marca em falta" }, { status: 400 });

  try {
    // Stock via snapshot (instantâneo) com fallback ao vivo; histórico via snapshot
    // (pré-calculado no PC da loja — pode ainda não existir → pendingHistory).
    const [{ items }, history] = await Promise.all([fetchStock(), getBrandHistorySnapshot()]);
    return NextResponse.json(buildBrandAnalysis(marca, items, history));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
