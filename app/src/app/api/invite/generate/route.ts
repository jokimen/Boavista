import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperadmin } from "@/lib/auth/api-session";
import { logAudit } from "@/lib/auth/audit";

function generateCode(): string {
  // 16 bytes = 128 bits de entropia. Agrupado em blocos de 4 para legibilidade.
  const hex = randomBytes(16).toString("hex").toUpperCase();
  return (hex.match(/.{1,4}/g) ?? [hex]).join("-");
}

export async function POST() {
  const guard = await requireSuperadmin();
  if (!guard.ok) return guard.res;

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  try {
    await adminDb.collection("invite_codes").doc(code).set({
      code,
      created_by: guard.session.userId,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      used_by: null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }

  await logAudit({
    user_id: guard.session.userId,
    action: "invite_generated",
    // Não gravar o código completo no log; só um prefixo para correlação.
    details: `Invite code generated (prefixo ${code.slice(0, 4)}…)`,
  });

  return NextResponse.json({ code, expires_at: expiresAt });
}
