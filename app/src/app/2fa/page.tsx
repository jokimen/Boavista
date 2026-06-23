"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export default function TwoFAPage() {
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleDigit(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d !== "") && newCode[5] !== "") {
      handleVerify(newCode.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify(token: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError("Código inválido. Tenta novamente.");
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      router.push("/");
    } catch {
      setError("Erro ao verificar código.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        <div className="bg-bg-card border border-border rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-border-subtle border border-[#3b82f6]/30 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={24} className="text-[#3b82f6]" />
          </div>
          <h2 className="text-base font-semibold text-text-primary mb-1">Autenticação de 2 fatores</h2>
          <p className="text-xs text-text-muted mb-6">
            Abre a app Google Authenticator e introduz o código de 6 dígitos.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-bg/30 border border-[#ef4444]/30 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-center mb-6">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                disabled={loading}
                className="w-11 h-12 text-center text-xl font-bold bg-border border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50 focus:border-[#3b82f6] transition-colors disabled:opacity-50 font-mono"
              />
            ))}
          </div>

          <button
            onClick={() => handleVerify(code.join(""))}
            disabled={loading || code.some(d => !d)}
            className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {loading ? "A verificar..." : "Verificar"}
          </button>

          <div className="mt-4">
            <a href="/login" className="text-xs text-text-muted hover:text-text-secondary">Sair e voltar ao login</a>
          </div>
        </div>
      </div>
    </div>
  );
}
