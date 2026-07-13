import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { SupplierGroup, SupplierConfig } from "./constants";

export {
  SUPPLIER_GROUPS, SUPPLIER_GROUP_LABELS, normalizeTiers, rappelPctForTotal, rappelForTotal,
  encodeSupplierId, decodeSupplierId,
  type SupplierGroup, type SupplierConfigRow, type SupplierConfig, type RappelTier,
} from "./constants";
import { decodeSupplierId } from "./constants";

/** Config de fornecedores (grupo, objetivo de compra, rappel/escalões) indexada por código. */
export async function getSupplierConfig(): Promise<SupplierConfig> {
  try {
    const snap = await adminDb.collection("supplier_config").get();
    const out: SupplierConfig = {};
    for (const doc of snap.docs) {
      const r = doc.data();
      const tiers = Array.isArray(r.rappel_tiers)
        ? r.rappel_tiers.map((t: { min: unknown; pct: unknown }) => ({ min: Number(t.min) || 0, pct: Number(t.pct) || 0 }))
        : [];
      // A chave é o código REAL do fornecedor (VX_PROVEEDORES.PROVEEDOR): o campo
      // `proveedor` quando existe, senão o id descodificado (por causa do "/").
      const key = (typeof r.proveedor === "string" && r.proveedor) || decodeSupplierId(doc.id);
      out[key] = {
        grupo: (r.grupo as SupplierGroup) ?? null,
        objetivo_compra: Number(r.objetivo_compra ?? 0),
        rappel_pct: Number(r.rappel_pct ?? 0),
        rappel_tiers: tiers,
      };
    }
    return out;
  } catch {
    return {};
  }
}
