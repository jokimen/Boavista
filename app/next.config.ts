import type { NextConfig } from "next";

// Content-Security-Policy. Mantém-se permissiva em script/style ('unsafe-inline'
// é necessário ao bootstrap/hidratação do Next sem nonces; 'unsafe-eval' p/ o dev/HMR),
// mas FECHA o resto: sem objetos/plugins, sem <base> externa, forms só p/ self,
// e ligações de rede só a self + endpoints do Firebase (Auth via identitytoolkit/
// securetoken; Firestore/restantes via *.googleapis.com). Imagens/QR via data:.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseapp.com",
].join("; ");

// Headers de segurança aplicados a todas as respostas.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // O firebase-admin (via jwks-rsa) carrega o 'jose' (ESM-only) por import dinâmico.
  // Se o Turbopack o "externalizar" via require(), rebenta com ERR_REQUIRE_ESM no
  // runtime da Vercel. Marcá-lo como server external faz o Node carregá-lo nativamente.
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
