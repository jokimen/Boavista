import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionIdentity } from "@/lib/auth/api-session";
import { verifyTotpToken } from "@/lib/auth/totp";
import { readTotpSecret } from "@/lib/auth/totp-store";
import { TWOFA_COOKIE, signTwofa, twofaCookieOptions } from "@/lib/auth/twofa-session";
import { logAudit } from "@/lib/auth/audit";

const schema = z.object({ token: z.string().regex(/^\d{6}$/, "Código de 6 dígitos") });

export async function POST(request: Request) {
  const id = await getSessionIdentity();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const { token } = parsed.data;

  const secret = await readTotpSecret(id.userId);
  if (!secret) {
    return NextResponse.json({ error: "2FA not configured" }, { status: 400 });
  }

  if (!verifyTotpToken(token, secret)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await logAudit({ user_id: id.userId, action: "2fa_verify", details: "Successful 2FA verification" });

  // Marca o 2FA como verificado nesta sessão (cookie httpOnly assinado).
  const res = NextResponse.json({ success: true });
  res.cookies.set(TWOFA_COOKIE, signTwofa(id.userId), twofaCookieOptions());
  return res;
}
