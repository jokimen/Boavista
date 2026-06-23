import { NextResponse, type NextRequest } from "next/server";
import { resolveDateRange, resolvePreviousRange, type PeriodKey } from "@/lib/filters/range";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { saveSnapshot, type DashboardSnapshot } from "@/lib/snapshots/store";

export const maxDuration = 300; // pode demorar (API Visual lenta); corre em fundo no PC

/**
 * Pré-calcula os snapshots do dashboard para os períodos-preset e grava-os no
 * Supabase. Pensado para correr no PC da loja (fala depressa com a API Visual),
 * no arranque e periodicamente. A Vercel depois LÊ do Supabase (instantâneo).
 *
 * Autenticado por CRON_SECRET (header x-cron-key ou Authorization: Bearer).
 * Calcula direto via visual-map (dados frescos, sem o cache de 5 min do adapter).
 */
const PRESETS: PeriodKey[] = ["today", "week", "month", "last_month", "quarter", "year"];

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-key") ?? bearer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { salesSummary, salesSummaryLight, salesByCategory } = await import("@/lib/api/visual-map");
  const saude = await getSaudeOcularCodes();

  const done: Record<string, string> = {};
  for (const period of PRESETS) {
    try {
      const { from, to } = resolveDateRange(period);
      const prev = resolvePreviousRange(period);
      // Em série (a API Visual só aceita 1 ligação; o cache em-memória partilha entre chamadas).
      const summary = await salesSummary(from, to);
      const light = await salesSummaryLight(from, to);
      const prevLight = await salesSummaryLight(prev.from, prev.to);
      const byCategory = await salesByCategory(from, to, saude);
      const snap: DashboardSnapshot = {
        summary, light, prevLight, prevLabel: prev.label, byCategory,
        computedAt: new Date().toISOString(),
      };
      await saveSnapshot(period, snap);
      done[period] = "ok";
    } catch (e) {
      done[period] = `erro: ${e instanceof Error ? e.message : e}`;
    }
  }
  return NextResponse.json({ precomputed: done });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
