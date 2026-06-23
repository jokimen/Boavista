import "server-only";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import type { Alert } from "@/types";

/** Dias após os quais um alerta inalterado pode voltar a ser enviado (re-lembrete). */
const RE_NOTIFY_DAYS = Number(process.env.ALERT_RENOTIFY_DAYS) > 0
  ? Number(process.env.ALERT_RENOTIFY_DAYS)
  : 14;

/**
 * Impressão digital ESTÁVEL de um alerta: ignora números (%, €, datas) que variam
 * dia-a-dia, para que "margem caiu para 38%" e "...39%" contem como o mesmo alerta.
 */
export function fingerprint(a: Alert): string {
  const norm = a.message.replace(/[\d.,%€/:-]+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha1").update(`${a.severity}|${a.module}|${norm}`).digest("hex");
}

/**
 * Filtra os alertas para enviar APENAS os novos ou que não são enviados há mais de
 * RE_NOTIFY_DAYS. Regista os enviados no Firestore. Se houver erro, devolve todos
 * (degrada com segurança — melhor enviar a mais do que falhar em silêncio).
 */
export async function filterNewAlerts(alerts: Alert[]): Promise<Alert[]> {
  if (alerts.length === 0) return [];

  const fps = alerts.map(fingerprint);
  const cutoff = Date.now() - RE_NOTIFY_DAYS * 86_400_000;

  try {
    const col = adminDb.collection("sent_alerts");
    // Firestore: fetch all fingerprints in parallel (batches of 10 for 'in' queries)
    const BATCH = 10;
    const lastByFp = new Map<string, number>();
    for (let i = 0; i < fps.length; i += BATCH) {
      const batch = fps.slice(i, i + BATCH);
      const snap = await col.where("fingerprint", "in", batch).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        lastByFp.set(d.fingerprint as string, new Date(d.last_sent as string).getTime());
      }
    }

    const toSend: Alert[] = [];
    const writes: { fp: string; module: string; message: string }[] = [];
    alerts.forEach((a, i) => {
      const fp = fps[i];
      const last = lastByFp.get(fp);
      if (last === undefined || last < cutoff) {
        toSend.push(a);
        writes.push({ fp, module: a.module, message: a.message.slice(0, 200) });
      }
    });

    if (writes.length > 0) {
      const batch = adminDb.batch();
      for (const w of writes) {
        const docRef = col.doc(w.fp);
        batch.set(docRef, {
          fingerprint: w.fp,
          module: w.module,
          message: w.message,
          last_sent: new Date().toISOString(),
        });
      }
      await batch.commit();
    }

    return toSend;
  } catch {
    return alerts; // erro → não deduplica, melhor enviar a mais
  }
}
