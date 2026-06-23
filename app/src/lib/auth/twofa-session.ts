import { createHmac, timingSafeEqual } from "crypto";

/**
 * Marcador de "2FA verificado nesta sessão" — cookie httpOnly assinado com HMAC.
 *
 * O cookie não pode ser forjado sem o segredo do servidor (TWOFA_COOKIE_SECRET)
 * e está ligado ao userId + uma validade. É definido após verificação TOTP
 * (ou conclusão do setup) e limpo no logout. O proxy/middleware exige-o para
 * aceder a qualquer rota protegida quando o utilizador tem 2FA ativo.
 */

export const TWOFA_COOKIE = "of_2fa";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  return process.env.TWOFA_COOKIE_SECRET ?? "";
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Gera o valor assinado para o cookie (ligado ao userId, com validade). */
export function signTwofa(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

/** Valida o cookie: assinatura correta, não expirado e ligado a este userId. */
export function isTwofaValid(value: string | undefined, userId: string): boolean {
  if (!value || !secret()) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, mac] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = hmac(`${uid}.${expStr}`);
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Opções do cookie (httpOnly, sameSite lax, secure em produção). */
export function twofaCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  };
}
