import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { TARGET_CATEGORIES, type TargetCategory, type MonthlyTargets } from "./constants";

export { TARGET_CATEGORIES, TARGET_LABELS, type TargetCategory, type MonthlyTargets } from "./constants";

/** Lê os objetivos definidos para um mês (year, month=1..12). */
export async function getMonthlyTargets(
  year: number,
  month: number,
): Promise<MonthlyTargets> {
  try {
    const docId = `${year}-${String(month).padStart(2, "0")}`;
    const doc = await adminDb.collection("monthly_targets").doc(docId).get();
    if (!doc.exists) return {};
    const data = doc.data() ?? {};
    const out: MonthlyTargets = {};
    for (const cat of TARGET_CATEGORIES) {
      if (typeof data[cat] === "number") out[cat] = data[cat];
    }
    return out;
  } catch {
    return {};
  }
}

/** Lê os objetivos por vendedor de um mês (year, month=1..12) → {usuario: €}. */
export async function getEmployeeTargets(
  year: number,
  month: number,
): Promise<Record<string, number>> {
  try {
    const docId = `${year}-${String(month).padStart(2, "0")}`;
    const doc = await adminDb.collection("employee_targets").doc(docId).get();
    if (!doc.exists) return {};
    const data = doc.data() ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Lista de códigos de produto considerados "saúde ocular". */
export async function getSaudeOcularCodes(): Promise<string[]> {
  try {
    const doc = await adminDb.collection("config").doc("saude_ocular_products").get();
    if (!doc.exists) return [];
    const data = doc.data();
    return Array.isArray(data?.codes) ? data.codes.map(String) : [];
  } catch {
    return [];
  }
}

/** Códigos saúde ocular com descrição (para a UI de gestão no Admin). */
export async function getSaudeOcularProducts(): Promise<{ codigo: string; descricao: string | null }[]> {
  try {
    const snap = await adminDb.collection("saude_ocular_products").orderBy("codigo").get();
    return snap.docs.map((d) => ({ codigo: String(d.data().codigo), descricao: (d.data().descricao as string | null) ?? null }));
  } catch {
    return [];
  }
}
