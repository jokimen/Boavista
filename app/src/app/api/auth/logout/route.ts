import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { TWOFA_COOKIE } from "@/lib/auth/twofa-session";

export async function POST() {
  const res = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  );
  // Clear both the session and 2FA cookies
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(TWOFA_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
