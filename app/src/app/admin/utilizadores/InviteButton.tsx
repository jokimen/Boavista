"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Key, Copy, Check } from "lucide-react";

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generateInvite() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/invite/generate", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Erro ao gerar convite");
        return;
      }
      const d = await res.json();
      setCode(d.code);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setCode("");
    setOpen(true);
    generateInvite();
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button onClick={handleOpen} variant="primary" size="sm">
        <Key size={14} />
        Gerar Código de Convite
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Código de Convite" size="sm">
        {loading ? (
          <div className="text-center py-4 text-text-muted text-sm">A gerar código...</div>
        ) : error ? (
          <div className="text-[#ef4444] text-sm">{error}</div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Partilha este código com o utilizador. Expira em 48 horas.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center text-2xl font-bold font-mono tracking-widest text-[#3b82f6] bg-border rounded-lg py-3 px-4">
                {code}
              </code>
              <button
                onClick={copyCode}
                className="p-2.5 rounded-lg bg-border text-text-secondary hover:text-text-primary transition-colors"
              >
                {copied ? <Check size={16} className="text-[#10b981]" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-text-muted text-center">
              O utilizador deve aceder a <strong>/register</strong> e introduzir este código.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
