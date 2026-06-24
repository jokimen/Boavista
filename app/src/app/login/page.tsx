"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      // Get ID token and set session cookie via API
      const idToken = await userCred.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível iniciar sessão.");
        await auth.signOut();
        return;
      }
      const data = await res.json();
      // Encaminha para configurar ou verificar 2FA (o proxy reforça isto).
      router.push(data.totpEnabled ? "/2fa" : "/2fa/setup");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Email ou password incorretos.");
      } else if (code === "auth/network-request-failed") {
        setError("Servidor indisponível. Verifique a ligação e tente novamente.");
      } else {
        setError("Erro ao iniciar sessão. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo_boavista.png"
            alt="Opticalia Boavista"
            width={72}
            height={72}
            priority
            className="rounded-2xl mb-4"
            style={{ filter: "drop-shadow(0 0 12px rgba(59,130,246,0.4))" }}
          />
          <h1 className="text-xl font-bold text-text-primary">Opticalia Boavista</h1>
          <p className="text-sm text-text-muted mt-1">Dashboard de Gestão</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6">
          <h2 className="text-base font-semibold text-text-primary mb-6">Iniciar sessão</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-bg/30 border border-[#ef4444]/30 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="email@opticalia.pt"
                  className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  A entrar...
                </>
              ) : "Entrar"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <a href="/register" className="text-sm text-[#3b82f6] hover:underline">
              Tem código de convite? Registar aqui
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
