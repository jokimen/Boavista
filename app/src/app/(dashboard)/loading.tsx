import { NeonLoader } from "@/components/layout/NeonLoader";

// Fallback de Suspense do grupo (dashboard): o Next mostra-o automaticamente
// enquanto a página de destino carrega os dados (navegação entre módulos).
export default function Loading() {
  return <NeonLoader />;
}
