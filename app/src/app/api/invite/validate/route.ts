import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";

const schema = z.object({ code: z.string().trim().min(4).max(64) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const { code } = parsed.data;

  // Lido server-side via Admin SDK: só responde válido/inválido, não expõe a lista.
  try {
    const doc = await adminDb.collection("invite_codes").doc(code).get();
    if (!doc.exists) return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
    const d = doc.data() ?? {};
    if (d.used_by) return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
    if (d.expires_at && new Date(d.expires_at as string).getTime() < Date.now()) {
      return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
  }

  return NextResponse.json({ valid: true });
}
