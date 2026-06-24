import { NextResponse } from "next/server";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth/session-cookie";

/**
 * POST /api/auth/session
 * Validates a Firebase ID token from the client and sets a signed HTTP-only session cookie.
 * Returns profile info (totpEnabled) so the client can redirect appropriately.
 */
export async function POST(request: Request) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const { idToken } = body;
  if (!idToken) return NextResponse.json({ error: "Token em falta" }, { status: 400 });

  // TEMP DEBUG: import dinâmico + captura de erro real
  let adminAuth, adminDb;
  try {
    const mod = await import("@/lib/firebase/admin");
    adminAuth = mod.adminAuth;
    adminDb = mod.adminDb;
  } catch (e: unknown) {
    return NextResponse.json({ error: "ADMIN_IMPORT: " + String((e as Error)?.stack || e) }, { status: 599 });
  }

  // Verify the Firebase ID token
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (e: unknown) {
    return NextResponse.json({ error: "VERIFY: " + String((e as Error)?.message || e) }, { status: 598 });
  }

  // Read profile from Firestore
  type ProfileShape = { is_active?: boolean; totp_enabled?: boolean; totp_verified?: boolean };
  let profile: ProfileShape | null = null;
  try {
    const doc = await adminDb.collection("profiles").doc(decoded.uid).get();
    if (doc.exists) profile = (doc.data() ?? null) as ProfileShape | null;
  } catch (e: unknown) {
    return NextResponse.json({ error: "FIRESTORE: " + String((e as Error)?.message || e) }, { status: 597 });
  }

  if (!profile?.is_active) {
    return NextResponse.json({ error: "Conta pendente de aprovação pelo administrador." }, { status: 403 });
  }

  const isActive = profile.is_active ?? false;
  const totpEnabled = profile.totp_enabled ?? false;

  // Sign and set the session cookie
  const cookieValue = signSession(decoded.uid, decoded.email ?? "", isActive, totpEnabled);
  const res = NextResponse.json({ success: true, totpEnabled });
  res.cookies.set(SESSION_COOKIE, cookieValue, sessionCookieOptions());
  return res;
}
