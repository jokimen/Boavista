import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Cofre dos segredos TOTP. O segredo vive na coleção `totp_secrets` do Firestore,
 * só acessível via Firebase Admin SDK (server-side). Nunca legível pelo utilizador.
 */
export async function readTotpSecret(userId: string): Promise<string | null> {
  try {
    const doc = await adminDb.collection("totp_secrets").doc(userId).get();
    if (doc.exists && doc.data()?.secret) return doc.data()!.secret as string;
    return null;
  } catch {
    return null;
  }
}

export async function writeTotpSecret(userId: string, secret: string): Promise<void> {
  await adminDb.collection("totp_secrets").doc(userId).set({
    user_id: userId,
    secret,
    updated_at: new Date().toISOString(),
  });
}
