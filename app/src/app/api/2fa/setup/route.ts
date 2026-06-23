import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionIdentity } from "@/lib/auth/api-session";
import { generateTotpSecret, getTotpUri, verifyTotpToken } from "@/lib/auth/totp";
import { writeTotpSecret } from "@/lib/auth/totp-store";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth/session-cookie";
import { TWOFA_COOKIE, signTwofa, twofaCookieOptions } from "@/lib/auth/twofa-session";
import { logAudit } from "@/lib/auth/audit";

const confirmSchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Código de 6 dígitos"),
  secret: z.string().trim().min(16).max(64),
});

export async function GET() {
  const id = await getSessionIdentity();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = generateTotpSecret();
  const uri = getTotpUri(id.email || id.userId, secret);

  // O segredo é devolvido ao cliente e reenviado no POST (confirmação) — não há
  // estado pendente no servidor; só é persistido no cofre após validar o token.
  try {
    const QRCode = (await import("qrcode")).default;
    const qrCode = await QRCode.toDataURL(uri);
    return NextResponse.json({ qrCode, secret });
  } catch {
    return NextResponse.json({ secret, qrCode: null });
  }
}

export async function POST(request: Request) {
  const id = await getSessionIdentity();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { token, secret } = parsed.data;

  if (!verifyTotpToken(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  // Segredo TOTP no cofre (coleção totp_secrets, só Admin SDK); profile fica só com as flags.
  await writeTotpSecret(id.userId, secret);
  await adminDb.collection("profiles").doc(id.userId).update({
    totp_enabled: true,
    totp_verified: true,
  });

  await logAudit({ user_id: id.userId, action: "2fa_setup", details: "TOTP 2FA configured" });

  // Concluir o setup conta como 2FA verificado nesta sessão. Reassinamos também o
  // cookie de sessão com totpEnabled=true (senão o proxy reencaminhava para /2fa/setup).
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, signSession(id.userId, id.email, id.isActive, true), sessionCookieOptions());
  res.cookies.set(TWOFA_COOKIE, signTwofa(id.userId), twofaCookieOptions());
  return res;
}
