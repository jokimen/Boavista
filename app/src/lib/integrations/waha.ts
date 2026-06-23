const WAHA_URL = process.env.WAHA_URL ?? "";
const WAHA_API_KEY = process.env.WAHA_API_KEY ?? "";
const WAHA_SESSION = process.env.WAHA_SESSION ?? "default";
const ALERT_PHONE = process.env.ALERT_WHATSAPP_NUMBER ?? "";

interface WahaMessage {
  chatId: string;
  text: string;
}

async function sendMessage(msg: WahaMessage): Promise<boolean> {
  if (!WAHA_URL || !ALERT_PHONE) return false;
  try {
    const res = await fetch(`${WAHA_URL}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": WAHA_API_KEY,
      },
      body: JSON.stringify({
        session: WAHA_SESSION,
        chatId: msg.chatId,
        text: msg.text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Indica se o WAHA está configurado (URL + número de destino). */
export function isWahaConfigured(): boolean {
  return Boolean(WAHA_URL && ALERT_PHONE);
}

export async function sendAlert(message: string): Promise<boolean> {
  if (!ALERT_PHONE) return false;
  const chatId = ALERT_PHONE.includes("@") ? ALERT_PHONE : `${ALERT_PHONE}@c.us`;
  return sendMessage({ chatId, text: `⚠️ *Opticalia Dashboard*\n\n${message}` });
}

export async function sendDailySummary(summary: string): Promise<boolean> {
  if (!ALERT_PHONE) return false;
  const chatId = ALERT_PHONE.includes("@") ? ALERT_PHONE : `${ALERT_PHONE}@c.us`;
  return sendMessage({ chatId, text: `📊 *Resumo diário Opticalia*\n\n${summary}` });
}
