"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Smartphone } from "lucide-react";

export default function TwoFASetupPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingQr, setLoadingQr] = useState(true);

  useEffect(() => {
    fetch("/api/2fa/setup")
      .then(r => r.json())
      .then(d => {
        setQrCode(d.qrCode);
        setSecret(d.secret);
      })
      .finally(() => setLoadingQr(false));
  }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code, secret }),
      });
      if (!res.ok) {
        setError("Código inválido. Verifica a app e tenta novamente.");
        return;
      }
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        <div className="bg-bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-border-subtle border border-[#3b82f6]/30 flex items-center justify-center">
              <ShieldCheck size={20} className="text-[#3b82f6]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Configurar 2FA</h2>
              <p className="text-xs text-text-muted">Obrigatório no primeiro acesso</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#3b82f6] text-white text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-sm text-text-secondary">Instala a app <strong className="text-text-primary">Google Authenticator</strong> no teu telemóvel.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#3b82f6] text-white text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-sm text-text-secondary">Lê o QR code abaixo com a app.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#3b82f6] text-white text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
              <p className="text-sm text-text-secondary">Introduz o código de 6 dígitos da app para confirmar.</p>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            {loadingQr ? (
              <div className="w-40 h-40 bg-border rounded-lg animate-pulse" />
            ) : qrCode ? (
              <div className="bg-white p-2 rounded-lg">
                <img src={qrCode} alt="QR Code 2FA" className="w-36 h-36" />
              </div>
            ) : (
              <div className="w-40 h-40 bg-border rounded-lg flex items-center justify-center text-text-muted text-xs text-center p-4">
                Erro ao gerar QR code
              </div>
            )}
          </div>

          {secret && (
            <div className="mb-4 p-3 rounded-lg bg-border border border-border-subtle">
              <p className="text-xs text-text-muted mb-1">Ou introduz manualmente:</p>
              <code className="text-xs text-text-primary font-mono tracking-widest break-all">{secret}</code>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-bg/30 border border-[#ef4444]/30 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <form onSubmit={handleSetup} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              className="w-full bg-border border border-border-subtle rounded-lg text-text-primary placeholder-text-muted px-3 py-2.5 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6]"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
            >
              {loading ? "A configurar..." : "Confirmar e Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
