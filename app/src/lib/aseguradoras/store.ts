import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { AseguradoraConfig, AseguradoraRow } from "./constants";

export { aseguradoraLabel, type AseguradoraConfig, type AseguradoraRow } from "./constants";

/**
 * Mapa código→{nome,ativo} das seguradoras (rotulado no Admin), lido do Firestore.
 * O parâmetro `admin` é mantido por compatibilidade mas é irrelevante: a leitura é
 * sempre server-side via Admin SDK.
 */
export async function getAseguradoraConfig(_opts?: { admin?: boolean }): Promise<AseguradoraConfig> {
  try {
    const snap = await adminDb.collection("aseguradora_config").get();
    const out: AseguradoraConfig = {};
    for (const doc of snap.docs) {
      const r = doc.data();
      out[doc.id] = { nome: String(r.nome ?? ""), ativo: r.ativo !== false } as AseguradoraRow;
    }
    return out;
  } catch {
    return {};
  }
}
