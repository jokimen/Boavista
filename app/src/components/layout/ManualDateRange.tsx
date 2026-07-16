"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Seletor De/Até MANUAL que comanda o intervalo da página via URL (`?from&to`),
 * à semelhança do menu Equipa. Ao mudar uma data sincroniza a URL e o servidor
 * recalcula os dados para o novo intervalo. É a ÚNICA fonte do período da página
 * (não usa os filtros globais/cookie). Datas em formato `YYYY-MM-DD`.
 */
export function ManualDateRange({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState<string>(initialFrom);
  const [to, setTo] = useState<string>(initialTo);

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo && nextFrom <= nextTo) {
      router.replace(`${pathname}?from=${nextFrom}&to=${nextTo}`, { scroll: false });
    }
  }

  const inp = "bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:border-[#3b82f6] outline-none";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-text-muted">De</label>
      <input type="date" value={from} max={to} onChange={(e) => applyRange(e.target.value, to)} className={inp} />
      <label className="text-xs text-text-muted">Até</label>
      <input type="date" value={to} min={from} onChange={(e) => applyRange(from, e.target.value)} className={inp} />
    </div>
  );
}
