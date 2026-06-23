"use client";

import { useEffect, useState } from "react";
import { isChunkLoadError, reloadForSkew, canAutoRecover } from "@/components/layout/ChunkReloadGuard";

/**
 * Error boundary de último recurso (substitui o layout raiz quando este falha).
 * Renderiza o próprio <html>/<body> e usa estilos inline (não há garantia de CSS).
 * Em deployment skew recarrega; nos restantes tenta UMA recuperação automática
 * (reset) — a maioria é transitória (cold-start) — e só mostra reload manual se
 * o erro persistir.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const skew = isChunkLoadError(error);
  const [recovering, setRecovering] = useState(true);

  useEffect(() => {
    if (skew) {
      reloadForSkew();
      return;
    }
    if (canAutoRecover()) {
      window.location.reload(); // reload "duro" (cold-start) — cooldown impede loop
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecovering(false);
  }, [skew]);

  const base = {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "#0b0f17",
    color: "#e5e7eb",
    fontFamily: "system-ui, sans-serif",
    textAlign: "center" as const,
    padding: 24,
  };

  if (skew || recovering) {
    return (
      <html lang="pt">
        <body style={base}>
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            {skew ? "Há uma versão nova — a atualizar…" : "A recuperar…"}
          </p>
        </body>
      </html>
    );
  }

  return (
    <html lang="pt">
      <body style={base}>
        <p style={{ fontSize: 14, color: "#9ca3af" }}>Não foi possível carregar a aplicação.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}
