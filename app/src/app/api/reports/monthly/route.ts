import { NextResponse, type NextRequest } from "next/server";
import { requireExport } from "@/lib/auth/guard";
import { validateReportRange } from "@/lib/filters/report-range";
import { monthlyReport } from "@/lib/api/visual-map";
import { getSaudeOcularCodes } from "@/lib/targets/store";
import { getAseguradoraConfig } from "@/lib/aseguradoras/store";

export const maxDuration = 300;

/** Dados do relatório MENSAL para um intervalo (?from=ISO&to=ISO). */
export async function GET(req: NextRequest) {
  const g = await requireExport("vendas"); if (!g.ok) return g.res;
  const v = validateReportRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"), 366);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const [saude, aseg] = await Promise.all([getSaudeOcularCodes(), getAseguradoraConfig()]);
    const names: Record<string, string> = {};
    for (const [codigo, row] of Object.entries(aseg)) names[codigo] = row.nome;
    const data = await monthlyReport(v.from, v.to, saude, names);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
