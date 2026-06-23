import { NextResponse, type NextRequest } from "next/server";
import { saveHeavySnapshot, getBrandHistorySnapshot } from "@/lib/snapshots/heavy";
import type { BrandHistoryData } from "@/lib/stock/constants";

export const maxDuration = 300; // 4 anos de vendas/entradas — lento; corre no PC da loja

const WINDOW_YEARS = 4;

/**
 * Pré-calcula o HISTÓRICO POR MARCA (unidades vendidas/compradas por ano + vendido
 * por artigo p/ rotação) e grava em heavy_snapshots `brand_history`. Pesado — corre
 * no PC da loja (fala depressa com OData). Incremental: o ano CORRENTE é sempre
 * recalculado (apanha movimento novo); anos antigos só uma vez (ficam no snapshot).
 *
 * Autenticado por CRON_SECRET (x-cron-key ou Authorization: Bearer).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-key") ?? bearer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandHistoryYear } = await import("@/lib/api/visual-map");
  const nowY = new Date().getFullYear();
  const years = Array.from({ length: WINDOW_YEARS }, (_, k) => nowY - (WINDOW_YEARS - 1) + k);

  const existing = (await getBrandHistorySnapshot()) ?? ({ generatedAt: "", byYear: {} } as BrandHistoryData);
  const byYear: BrandHistoryData["byYear"] = { ...existing.byYear };
  const done: Record<string, string> = {};

  for (const year of years) {
    const isCurrent = year === nowY;
    const cached = byYear[String(year)];
    // Anos antigos já calculados ficam em cache; o ano corrente recalcula sempre.
    // Exceção: se o cache for de uma versão antiga (sem receita/custo €), recalcula
    // para preencher os novos campos (faturação/margem/benchmark por marca).
    if (!isCurrent && cached && cached.brandRevenue) { done[year] = "cache"; continue; }
    try {
      const r = await brandHistoryYear(year);
      byYear[String(year)] = { brandSold: r.brandSold, brandBought: r.brandBought, brandRevenue: r.brandRevenue, brandCost: r.brandCost, soldByArticle: r.soldByArticle };
      done[year] = `ok (${Object.keys(r.brandSold).length} marcas vendidas)`;
    } catch (e) {
      done[year] = `erro: ${e instanceof Error ? e.message : e}`;
    }
  }

  // Limpa anos fora da janela (mantém o snapshot enxuto).
  for (const k of Object.keys(byYear)) if (!years.includes(Number(k))) delete byYear[k];

  await saveHeavySnapshot("brand_history", { generatedAt: new Date().toISOString(), byYear });
  return NextResponse.json({ years: done });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
