"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dois botões de tema (claro / escuro) — o ativo fica destacado. A preferência
 * fica em localStorage e é aplicada antes da hidratação por um script inline no
 * layout (sem flash). O estado é lido da classe `light` do <html> via
 * useSyncExternalStore (sem mismatch de hidratação: no servidor assume escuro).
 */
function subscribe(callback: () => void): () => void {
  const obs = new MutationObserver(callback);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const isLight = () => document.documentElement.classList.contains("light");

function setTheme(light: boolean) {
  document.documentElement.classList.toggle("light", light);
  try {
    localStorage.setItem("theme", light ? "light" : "dark");
  } catch {
    /* localStorage indisponível — fica só na sessão */
  }
}

export function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, isLight, () => false);

  const btn = (active: boolean) =>
    cn(
      "p-1.5 rounded-lg transition-colors",
      active
        ? "text-primary bg-bg-input"
        : "text-text-muted hover:text-text-primary hover:bg-bg-input",
    );

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setTheme(true)} className={btn(light)} title="Tema claro" aria-label="Tema claro" aria-pressed={light}>
        <Sun size={16} />
      </button>
      <button onClick={() => setTheme(false)} className={btn(!light)} title="Tema escuro" aria-label="Tema escuro" aria-pressed={!light}>
        <Moon size={16} />
      </button>
    </div>
  );
}
