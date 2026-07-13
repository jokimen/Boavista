import { NextResponse, type NextRequest } from "next/server";
import { requireExport } from "@/lib/auth/guard";
import { validateReportRange } from "@/lib/filters/report-range";
import { weeklyOpticaReport } from "@/lib/api/visual-map";

export const maxDuration = 300; // a API Visual é lenta; relatório on-demand

/** Dados do relatório SEMANAL de óptica para um intervalo (?from=ISO&to=ISO). */
export async function GET(req: NextRequest) {
  const g = await requireExport("equipa"); if (!g.ok) return g.res;
  const v = validateReportRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"), 186);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const data = await weeklyOpticaReport(v.from, v.to);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
