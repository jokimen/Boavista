import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { SESSION_COOKIE, verifySession } from "./session-cookie";
import type { UserRole } from "@/types";

/**
 * Identidade + role da sessão para ROTAS DE API (não redireciona; devolve null).
 * O proxy/middleware já garante autenticação+2FA para /api/*; aqui só precisamos
 * do userId/email e — para rotas de admin — do role (lido do perfil no Firestore).
 */
export interface ApiSession {
  userId: string;
  email: string;
  isActive: boolean;
  role: UserRole;
}

export async function getApiSession(): Promise<ApiSession | null> {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  try {
    const doc = await adminDb.collection("profiles").doc(session.userId).get();
    if (!doc.exists) return null;
    const p = doc.data() ?? {};
    return {
      userId: session.userId,
      email: session.email,
      isActive: p.is_active ?? false,
      role: (p.role ?? "commercial") as UserRole,
    };
  } catch {
    return null;
  }
}

/** Exige role superadmin. Uso: `const g = await requireSuperadmin(); if (!g.ok) return g.res;` */
export async function requireSuperadmin(): Promise<
  { ok: true; session: ApiSession } | { ok: false; res: NextResponse }
> {
  const s = await getApiSession();
  if (!s) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (s.role !== "superadmin") {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session: s };
}

/**
 * Identidade da sessão SEM exigir role nem perfil. Para rotas que correm ANTES do
 * 2FA estar concluído (ex.: /api/2fa/setup e /api/2fa/verify), onde só precisamos
 * do userId/email/isActive a partir do cookie de sessão assinado.
 */
export async function getSessionIdentity(): Promise<{ userId: string; email: string; isActive: boolean } | null> {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return { userId: session.userId, email: session.email, isActive: session.isActive };
}
