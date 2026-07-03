import Image from "next/image";

/**
 * Ecrã de carregamento com o logo Óptica Boavista em efeito neon.
 * Usado como fallback de Suspense (loading.tsx) ao mudar de página / carregar
 * dados, e pode ser reutilizado em qualquer estado de loading.
 */
export function NeonLoader({ label = "A carregar…" }: { label?: string }) {
  return (
    <div className="neon-loader flex h-full w-full flex-col items-center justify-center gap-6 bg-bg-base">
      <div className="relative flex items-center justify-center">
        {/* Anel neon a rodar à volta do logo */}
        <div className="neon-ring absolute h-36 w-36" />
        <Image
          src="/logo_boavista.png"
          alt="Óptica Boavista"
          width={120}
          height={120}
          priority
          className="neon-logo rounded-full"
        />
      </div>
      <p className="text-sm font-medium tracking-wide text-text-secondary">{label}</p>
    </div>
  );
}
