"use client";

import { useEffect, useState } from "react";
import { isChunkLoadError, reloadForSkew, canAutoRecover } from "@/components/layout/ChunkReloadGuard";

/**
 * Error boundary de segmento.
 *  - Deployment skew (falha a carregar código): recarrega para a build nova.
 *  - Outros erros: tenta UMA recuperação automática (reset → re-render do
 *    segmento). A esmagadora maioria destes erros é TRANSITÓRIA (cold-start
 *    serverless após idle — a 1ª ligação à BD/API falha, a 2ª já passa), por
 *    isso o reset torna-os invisíveis. Só se o erro persistir (cooldown gasto)
 *    é que mostramos a página de marca com reload manual.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const skew = isChunkLoadError(error);
  // Otimista: assumimos recuperação até o cooldown dizer que já tentámos há pouco.
  const [recovering, setRecovering] = useState(true);

  useEffect(() => {
    if (skew) {
      reloadForSkew();
      return;
    }
    if (canAutoRecover()) {
      // Reload "duro" = exatamente o que resolve manualmente (a 2ª chamada apanha
      // a função serverless já quente). Mais fiável que reset() para re-executar
      // os server components no cold-start. O cooldown impede loop em erro real.
      window.location.reload();
      return;
    }
    // Decisão baseada num sistema externo (cooldown em sessionStorage): já
    // tentámos há pouco e voltou a falhar → é erro real, mostra página manual.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecovering(false);
  }, [skew, reset]);

  if (skew || recovering) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-secondary text-sm">
          {skew ? "Há uma versão nova — a atualizar…" : "A recuperar…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-text-secondary text-sm">Não foi possível carregar esta página.</p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563eb] transition-colors"
        >
          Tentar de novo
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-card-hover transition-colors"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
