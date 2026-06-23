import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Regista uma entrada de auditoria no Firestore (coleção `audit_logs`).
 * Best-effort: nunca lança (não deve bloquear a ação principal).
 */
export async function logAudit(entry: {
  user_id: string | null;
  action: string;
  details: string;
  ip?: string;
}): Promise<void> {
  try {
    await adminDb.collection("audit_logs").add({
      user_id: entry.user_id,
      action: entry.action,
      details: entry.details,
      ip: entry.ip ?? "system",
      created_at: new Date().toISOString(),
    });
  } catch {
    /* ignora falhas de auditoria */
  }
}
