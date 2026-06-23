import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/** Conteúdo de um snapshot do dashboard (tudo o que a página precisa, pré-calculado). */
export interface DashboardSnapshot {
  summary: Awaited<ReturnType<typeof import("@/lib/api/visual-map")["salesSummary"]>>;
  light: Awaited<ReturnType<typeof import("@/lib/api/visual-map")["salesSummaryLight"]>>;
  prevLight: Awaited<ReturnType<typeof import("@/lib/api/visual-map")["salesSummaryLight"]>>;
  prevLabel: string;
  byCategory: Awaited<ReturnType<typeof import("@/lib/api/visual-map")["salesByCategory"]>>;
  computedAt: string;
}

/**
 * Lê o snapshot de um período-preset do Cloud Firestore.
 */
export async function getSnapshot(period: string): Promise<DashboardSnapshot | null> {
  try {
    const doc = await adminDb.collection("dashboard_snapshots").doc(period).get();
    if (!doc.exists) return null;
    return doc.data()?.data as DashboardSnapshot;
  } catch {
    return null;
  }
}

/** Grava (upsert) um snapshot no Cloud Firestore (usado pelo cron de pré-cálculo). */
export async function saveSnapshot(period: string, data: DashboardSnapshot): Promise<void> {
  await adminDb.collection("dashboard_snapshots").doc(period).set({
    data,
    updated_at: new Date().toISOString()
  });
}
