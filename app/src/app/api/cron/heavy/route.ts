import { NextResponse, type NextRequest } from "next/server";
import { saveHeavySnapshot } from "@/lib/snapshots/heavy";

export const maxDuration = 300; // catálogo completo + OData — lento; corre no PC da loja

/**
 * Pré-calcula as leituras PESADAS sem dependência de datas (stock, clientes, LC)
 * e grava-as no Supabase (heavy_snapshots). Pensado para correr no PC da loja
 * (fala depressa com a API Visual/OData), no arranque e periodicamente. A Vercel
 * depois LÊ do Supabase (instantâneo). Em série — a API Visual só aceita 1 ligação.
 *
 * Autenticado por CRON_SECRET (header x-cron-key ou Authorization: Bearer).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = request.headers.get("x-cron-key") ?? bearer;
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stock, clients, contactLensClients } = await import("@/lib/api/visual-map");
  const done: Record<string, string> = {};

  // Stock primeiro (o mais pesado/pedido), depois clientes e LC. Em série.
  try {
    const data = await stock();
    await saveHeavySnapshot("stock", data);
    done.stock = `ok (${data.items.length} artigos)`;
  } catch (e) { done.stock = `erro: ${e instanceof Error ? e.message : e}`; }

  try {
    const data = await clients();
    await saveHeavySnapshot("clients", data);
    done.clients = `ok (${data.length} clientes)`;
  } catch (e) { done.clients = `erro: ${e instanceof Error ? e.message : e}`; }

  try {
    const data = await contactLensClients();
    await saveHeavySnapshot("contact_lens", data);
    done.contact_lens = `ok (${data.diarias.length + data.mensais.length} clientes LC)`;
  } catch (e) { done.contact_lens = `erro: ${e instanceof Error ? e.message : e}`; }

  return NextResponse.json({ precomputed: done });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
