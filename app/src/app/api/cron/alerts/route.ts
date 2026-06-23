import { NextResponse, type NextRequest } from "next/server";
import { computeAlerts, formatAlertsText } from "@/lib/alerts/engine";
import { filterNewAlerts } from "@/lib/alerts/dedup";
import { logAudit } from "@/lib/auth/audit";
import { isWahaConfigured, sendAlert } from "@/lib/integrations/waha";

/**
 * Envio AUTOMÁTICO de alertas por WhatsApp (sem sessão de utilizador).
 * Pensado para um agendador (cron) — autenticado por segredo partilhado
 * `CRON_SECRET` no header `x-cron-key`. O proxy deixa passar /api/cron quando
 * o segredo bate certo (ver lib/firebase/middleware.ts).
 *
 * Usa o motor de alertas em modo admin (service role) para ler os objetivos
 * mensais mesmo sem sessão (a RLS de monthly_targets é só `authenticated`).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Aceita o segredo via header próprio (x-cron-key, usado pela VPS/node-cron) OU
  // via Authorization: Bearer (que o Vercel Cron envia automaticamente com CRON_SECRET).
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-key") ?? bearer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allAlerts = await computeAlerts({ admin: true });

  if (!isWahaConfigured()) {
    return NextResponse.json({ sent: false, configured: false, count: allAlerts.length });
  }

  // Dedup: só envia os novos / não enviados há mais de RE_NOTIFY_DAYS.
  const alerts = await filterNewAlerts(allAlerts);
  if (alerts.length === 0) {
    return NextResponse.json({ sent: false, configured: true, count: 0, total: allAlerts.length, note: "sem alertas novos" });
  }

  const sent = await sendAlert(formatAlertsText(alerts));

  // Registo em audit_logs (best-effort via Admin SDK; nunca bloqueia o envio).
  await logAudit({
    user_id: null,
    action: "alerts_sent_auto",
    details: `Envio automático de ${alerts.length} alerta(s): ${sent ? "ok" : "falhou"}`,
    ip: "cron",
  });

  return NextResponse.json({ sent, configured: true, count: alerts.length });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// GET também permitido (facilita agendadores simples); protegido pelo mesmo segredo.
export async function GET(request: NextRequest) {
  return handle(request);
}
