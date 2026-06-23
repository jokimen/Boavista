import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { logAudit } from "@/lib/auth/audit";
import { registerSchema } from "@/lib/validation/register";

/**
 * Registo por convite — server-side e transacional (Firebase Admin SDK).
 *  1. Valida o input (zod).
 *  2. Cria o utilizador no Firebase Auth (fica pendente: profile is_active=false).
 *  3. Consome o código de convite ATOMICAMENTE numa transação do Firestore e cria
 *     o documento de perfil (não há trigger como no Postgres → criamo-lo aqui).
 *  4. Se o código já estava usado/expirado → reverte (apaga o utilizador criado).
 *
 * Requer as credenciais do Admin SDK (FIREBASE_*). O "sign up" público não existe:
 * só este endpoint (com service account) cria contas, sempre exigindo convite válido.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    );
  }
  const { code, name, email, password } = parsed.data;

  // 1) Criar o utilizador no Firebase Auth (email já confirmado).
  let userId: string;
  try {
    const created = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
    });
    userId = created.uid;
  } catch (err: unknown) {
    const fbCode = (err as { code?: string })?.code ?? "";
    const msg = /already-exists|email-already/i.test(fbCode)
      ? "Já existe uma conta com este email."
      : "Não foi possível criar a conta.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 2) Consumir o código + criar o perfil atomicamente; reverter se falhar.
  try {
    await adminDb.runTransaction(async (tx) => {
      const inviteRef = adminDb.collection("invite_codes").doc(code);
      const snap = await tx.get(inviteRef);
      if (!snap.exists) throw new Error("invalid");
      const d = snap.data() ?? {};
      if (d.used_by) throw new Error("used");
      if (d.expires_at && new Date(d.expires_at as string).getTime() < Date.now()) throw new Error("expired");

      tx.update(inviteRef, { used_by: userId, used_at: new Date().toISOString() });
      tx.set(adminDb.collection("profiles").doc(userId), {
        id: userId,
        email,
        name,
        role: "commercial",
        is_active: false,
        totp_enabled: false,
        totp_verified: false,
        permissions: [],
        invite_code: code,
        created_at: new Date().toISOString(),
      });
    });
  } catch {
    await adminAuth.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: "Código de convite inválido ou já utilizado." },
      { status: 400 },
    );
  }

  await logAudit({ user_id: userId, action: "user_registered", details: `Registo via convite ${code}` });

  return NextResponse.json({ success: true });
}
