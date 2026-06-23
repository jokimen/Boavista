import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "of_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret(): string {
  return process.env.TWOFA_COOKIE_SECRET ?? "";
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function signSession(
  userId: string,
  email: string,
  isActive: boolean,
  totpEnabled: boolean
): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${email}.${isActive ? "1" : "0"}.${totpEnabled ? "1" : "0"}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export interface DecryptedSession {
  userId: string;
  email: string;
  isActive: boolean;
  totpEnabled: boolean;
  exp: number;
}

export function verifySession(value: string | undefined): DecryptedSession | null {
  if (!value || !secret()) return null;
  const parts = value.split(".");
  if (parts.length !== 6) return null;
  const [uid, email, activeStr, totpStr, expStr, mac] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = hmac(`${uid}.${email}.${activeStr}.${totpStr}.${expStr}`);
  try {
    const a = Buffer.from(mac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return {
        userId: uid,
        email,
        isActive: activeStr === "1",
        totpEnabled: totpStr === "1",
        exp,
      };
    }
  } catch {}
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
