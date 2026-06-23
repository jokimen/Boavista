"use client";

import { useEffect } from "react";

/**
 * Auto-recuperação de "deployment skew".
 *
 * Quando sai uma nova deployment, a Vercel remove do CDN os ficheiros (chunks/RSC)
 * da build antiga. Um separador que ficou aberto/idle ainda está na build antiga;
 * ao navegar/recarregar pede pedaços que já não existem → o browser mostra
 * "This page couldn't load". Sem o plano Pro (Skew Protection) a defesa é no
 * cliente: ao detetar uma falha de carregamento de chunk, fazemos um reload
 * "duro" para a build nova.
 *
 * Guarda contra ciclos: só recarrega se não recarregámos nos últimos 10s
 * (senão um erro persistente por outra razão entraria em loop infinito).
 */
const RELOAD_KEY = "of_skew_reload_at";
const RELOAD_COOLDOWN_MS = 10_000;

/** Heurística: o erro é uma falha de carregamento de código (skew), não um bug de lógica. */
export function isChunkLoadError(err: unknown): boolean {
  const msg =
    (err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "")) || "";
  return /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to fetch RSC payload/i.test(
    msg,
  );
}

/** Recarrega a página uma vez (com cooldown anti-loop). Devolve true se recarregou. */
export function reloadForSkew(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage indisponível — segue para o reload na mesma */
  }
  window.location.reload();
  return true;
}

/**
 * Verifica se podemos tentar uma recuperação automática agora (cooldown anti-loop)
 * e, em caso afirmativo, marca o instante. Devolve true se está autorizado a tentar.
 * Usado pelos error boundaries para auto-recuperar de erros TRANSITÓRIOS (ex.:
 * cold-start serverless após idle — a 1ª chamada à BD/API falha, a 2ª já passa).
 * Se a recuperação falhar (erro persistente), o cooldown impede novo retry e o
 * boundary mostra a página de erro manual.
 */
const RETRY_KEY = "of_err_retry_at";
const RETRY_COOLDOWN_MS = 12_000;
export function canAutoRecover(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RETRY_KEY) ?? "0");
    if (Date.now() - last < RETRY_COOLDOWN_MS) return false;
    sessionStorage.setItem(RETRY_KEY, String(Date.now()));
    return true;
  } catch {
    return false; // sem sessionStorage não arriscamos loop — mostra página manual
  }
}

export function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.error ?? e.message)) reloadForSkew();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) reloadForSkew();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
