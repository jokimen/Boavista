import { NextResponse, type NextRequest } from "next/server";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { writeDays, existingDays } from "@/lib/snapshots/daily";

export const maxDuration = 300;

/**
 * Constrói/atualiza os agregados DIÁRIOS (tabela daily_metrics) a partir da API Visual.
 * Corre no PC da loja (secret CRON_SECRET). Estratégia:
 *  - mês ATUAL e ANTERIOR → recalculados sempre (apanha lançamentos recentes/atrasados);
 *  - meses mais antigos → calculados UMA vez (backfill); depois saltados.
 * Vai buscar 1 mês de cada vez à API (eficiente) e distribui por dia.
 */
function monthKey(y: number, mo: number) { return `${y}-${String(mo + 1).padStart(2, "0")}`; }

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-key") ?? bearer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { computeDailyForRange } = await import("@/lib/api/visual-map");
  const saude = await getSaudeOcularCodes();

  const now = new Date();
  // Análise restrita a 2 anos: ano atual + 1 anterior (ex.: 2026 e 2025).
  const startYear = Number(process.env.DAILY_BACKFILL_YEAR) || now.getFullYear() - 1;
  const curKey = monthKey(now.getFullYear(), now.getMonth());
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prev.getFullYear(), prev.getMonth());

  // Meses que já têm dados (para saltar no backfill).
  const existing = await existingDays();
  const monthsWithData = new Set([...existing].map((d) => d.slice(0, 7)));

  // Processa do MAIS RECENTE para o mais antigo: o mês atual (o mais usado) fica
  // pronto primeiro; o histórico continua a encher a seguir.
  const result: Record<string, string> = {};
  let y = now.getFullYear(), mo = now.getMonth();
  while (y > startYear || (y === startYear && mo >= 0)) {
    const key = monthKey(y, mo);
    const mustRefresh = key === curKey || key === prevKey;
    if (mustRefresh || !monthsWithData.has(key)) {
      try {
        const from = new Date(y, mo, 1).toISOString();
        const to = new Date(y, mo + 1, 1).toISOString();
        const days = await computeDailyForRange(from, to, saude);
        await writeDays(days);
        result[key] = `${days.size} dias${mustRefresh ? " (refresh)" : ""}`;
      } catch (e) {
        result[key] = `erro: ${e instanceof Error ? e.message : e}`;
      }
    }
    mo--; if (mo < 0) { mo = 11; y--; }
  }
  return NextResponse.json({ months: result });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
