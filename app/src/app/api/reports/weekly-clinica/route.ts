import { NextResponse, type NextRequest } from "next/server";
import { requireExport } from "@/lib/auth/guard";
import { validateReportRange } from "@/lib/filters/report-range";
import { weeklyClinicaReport } from "@/lib/api/visual-map";

export const maxDuration = 300;

/** Dados do relatório SEMANAL da clínica (optometristas) para um intervalo. */
export async function GET(req: NextRequest) {
  const g = await requireExport("equipa"); if (!g.ok) return g.res;
  const v = validateReportRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"), 186);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const data = await weeklyClinicaReport(v.from, v.to);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
