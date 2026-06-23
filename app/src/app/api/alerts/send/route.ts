import { NextResponse } from "next/server";
import { requireModule } from "@/lib/auth/guard";
import { logAudit } from "@/lib/auth/audit";
import { computeAlerts, formatAlertsText } from "@/lib/alerts/engine";
import { isWahaConfigured, sendAlert } from "@/lib/integrations/waha";

/**
 * Calcula os alertas atuais e envia-os por WhatsApp (WAHA).
 * Devolve o estado de configuração para o frontend poder dar feedback claro.
 */
export async function POST() {
  // Só quem tem acesso ao módulo Alertas pode disparar o envio.
  const session = await requireModule("alertas");

  const alerts = await computeAlerts();
  const text = formatAlertsText(alerts);

  if (!isWahaConfigured()) {
    return NextResponse.json({ sent: false, configured: false, count: alerts.length });
  }

  const sent = await sendAlert(text);

  await logAudit({
    user_id: session.userId,
    action: "alerts_sent",
    details: `Envio de ${alerts.length} alerta(s) por WhatsApp: ${sent ? "ok" : "falhou"}`,
  });

  return NextResponse.json({ sent, configured: true, count: alerts.length });
}
