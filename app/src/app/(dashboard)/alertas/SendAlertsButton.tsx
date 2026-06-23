"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Check, AlertTriangle } from "lucide-react";

type Result = { ok: boolean; text: string } | null;

export function SendAlertsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function send() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/alerts/send", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: d.error ?? "Erro ao enviar." });
      } else if (!d.configured) {
        setResult({ ok: false, text: "WAHA não configurado (define WAHA_URL e ALERT_WHATSAPP_NUMBER)." });
      } else if (d.sent) {
        setResult({ ok: true, text: `${d.count} alerta(s) enviado(s) por WhatsApp.` });
      } else {
        setResult({ ok: false, text: "Falha no envio — verifica a sessão do WAHA." });
      }
    } catch {
      setResult({ ok: false, text: "Erro de rede." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`text-xs flex items-center gap-1 ${result.ok ? "text-[#10b981]" : "text-[#f59e0b]"}`}>
          {result.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          {result.text}
        </span>
      )}
      <Button variant="primary" size="sm" loading={loading} onClick={send}>
        <Send size={14} />
        Enviar por WhatsApp
      </Button>
    </div>
  );
}
