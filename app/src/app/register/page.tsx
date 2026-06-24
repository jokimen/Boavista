"use client";

import { useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Lock, Mail, User, Key } from "lucide-react";

export default function RegisterPage() {
  const [step, setStep] = useState<"invite" | "register">("invite");
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function validateInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/invite/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Código inválido ou expirado.");
        return;
      }
      setStep("register");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Registo atómico server-side (cria utilizador + consome convite).
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode, name, email, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Erro ao registar. Tente novamente.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Erro ao registar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
        <div className="w-full max-w-sm bg-bg-card border border-border rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-success-bg border border-[#10b981]/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-[#10b981] text-xl">✓</span>
          </div>
          <h2 className="text-base font-semibold text-text-primary mb-2">Registo submetido</h2>
          <p className="text-sm text-text-secondary mb-6">
            O teu pedido foi enviado para aprovação. Receberás um email quando a conta for ativada.
          </p>
          <a href="/login" className="text-sm text-[#3b82f6] hover:underline">Voltar ao login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo_boavista.png"
            alt="Óptica Boavista"
            width={72}
            height={72}
            priority
            className="rounded-2xl mb-4"
            style={{ filter: "drop-shadow(0 0 12px rgba(59,130,246,0.4))" }}
          />
          <h1 className="text-xl font-bold text-text-primary">Óptica Boavista</h1>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6">
          <h2 className="text-base font-semibold text-text-primary mb-2">
            {step === "invite" ? "Código de convite" : "Criar conta"}
          </h2>
          <p className="text-xs text-text-muted mb-6">
            {step === "invite" ? "Introduz o código que recebeste por email." : "Preenche os teus dados para criar a conta."}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-bg/30 border border-[#ef4444]/30 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          {step === "invite" ? (
            <form onSubmit={validateInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Código de Convite</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    required
                    placeholder="XXXX-XXXX"
                    className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
                {loading ? "A verificar..." : "Continuar"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nome completo</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Nome Apelido" className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="email@opticalia.pt" className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
                {loading ? "A criar conta..." : "Criar conta"}
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <a href="/login" className="text-xs text-text-muted hover:text-text-secondary">Voltar ao login</a>
          </div>
        </div>
      </div>
    </div>
  );
}
