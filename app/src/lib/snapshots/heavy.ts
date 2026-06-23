import "server-only";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Leitura/escrita dos snapshots PESADOS (coleção heavy_snapshots no Firestore):
 * stock, base de clientes e clientes de LC. O cron do PC da loja calcula e grava;
 * a Vercel lê (mesma região = instantâneo).
 */
import type { stock, clients, contactLensClients } from "@/lib/api/visual-map";
import type { BrandHistoryData } from "@/lib/stock/constants";

export type StockData = Awaited<ReturnType<typeof stock>>;
export type ClientsData = Awaited<ReturnType<typeof clients>>;
export type ContactLensData = Awaited<ReturnType<typeof contactLensClients>>;

export type HeavyKey = "stock" | "clients" | "contact_lens" | "brand_history";

async function getHeavy<T>(key: HeavyKey): Promise<T | null> {
  try {
    const doc = await adminDb.collection("heavy_snapshots").doc(key).get();
    if (!doc.exists) return null;
    return doc.data()?.data as T;
  } catch {
    return null;
  }
}

/** Grava (upsert) um snapshot pesado no Firestore (cron de pré-cálculo). */
export async function saveHeavySnapshot(key: HeavyKey, data: unknown): Promise<void> {
  await adminDb.collection("heavy_snapshots").doc(key).set({
    data,
    updated_at: new Date().toISOString(),
  });
}

export const getStockSnapshot = () => getHeavy<StockData>("stock");
export const getClientsSnapshot = () => getHeavy<ClientsData>("clients");
export const getContactLensSnapshot = () => getHeavy<ContactLensData>("contact_lens");
export const getBrandHistorySnapshot = () => getHeavy<BrandHistoryData>("brand_history");
