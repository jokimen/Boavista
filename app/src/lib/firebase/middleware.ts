import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-cookie";
import { TWOFA_COOKIE, isTwofaValid } from "@/lib/auth/twofa-session";
import { rateLimit } from "@/lib/security/rate-limit";

const RATE_LIMITS: { prefix: string; limit: number }[] = [
  { prefix: "/api/register", limit: 8 },
  { prefix: "/api/invite/validate", limit: 15 },
  { prefix: "/api/2fa/verify", limit: 15 },
  { prefix: "/api/2fa/setup", limit: 15 },
];

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const method = request.method;

  // ── CSRF Protection & Rate Limiting ────────────────────────────
  if (isApi) {
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (origin) {
        try {
          if (new URL(origin).host !== request.headers.get("host")) {
            return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
        }
      }
    }
    const rule = RATE_LIMITS.find((r) => pathname.startsWith(r.prefix));
    if (rule) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      if (!rateLimit(`${ip}:${rule.prefix}`, rule.limit, 60_000)) {
        return NextResponse.json(
          { error: "Demasiados pedidos. Tenta novamente dentro de um minuto." },
          { status: 429 },
        );
      }
    }
  }

  // ── Cron endpoints authentication (API keys or authorization bearer) ──
  if (pathname.startsWith("/api/cron")) {
    const secret = process.env.CRON_SECRET;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const provided = request.headers.get("x-cron-key") ?? bearer;
    if (secret && provided === secret) return response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Decode session cookie ─────────────────────────────────────────
  const sessionVal = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(sessionVal);

  const isLoginRegister = pathname.startsWith("/login") || pathname.startsWith("/register");
  const is2faPage = pathname.startsWith("/2fa");
  const isLogout = pathname.startsWith("/api/auth/logout");
  const isInviteValidate = pathname.startsWith("/api/invite/validate");

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // ── 1) No session ──────────────────────────────────────────────────
  if (!session) {
    if (isLoginRegister || isInviteValidate) return response;
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return redirectTo("/login");
  }

  // ── 2) Account inactive (waiting for approval or disabled) ──────────
  if (!session.isActive) {
    if (isLogout) return response;
    if (isApi) return NextResponse.json({ error: "Conta inativa ou por aprovar" }, { status: 403 });
    if (pathname.startsWith("/login")) return response; // Show pending message on login page
    return redirectTo("/login");
  }

  // ── 3) 2FA not configured ──────────────────────────────────────────
  if (!session.totpEnabled) {
    if (pathname.startsWith("/2fa/setup") || pathname.startsWith("/api/2fa/setup") || isLogout) {
      return response;
    }
    if (isApi) return NextResponse.json({ error: "Configuração de 2FA necessária" }, { status: 403 });
    return redirectTo("/2fa/setup");
  }

  // ── 4) 2FA configured but not verified in this session ─────────────
  const twofaOk = isTwofaValid(request.cookies.get(TWOFA_COOKIE)?.value, session.userId);
  if (!twofaOk) {
    if (pathname === "/2fa" || pathname.startsWith("/api/2fa/verify") || isLogout) {
      return response;
    }
    if (isApi) return NextResponse.json({ error: "Verificação de 2FA necessária" }, { status: 401 });
    return redirectTo("/2fa");
  }

  // ── 5) Fully authenticated - redirect away from auth/2FA pages ─────
  if (isLoginRegister || is2faPage) return redirectTo("/");

  return response;
}
