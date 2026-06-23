/**
 * Constantes/tipos de objetivos — SEM dependências de servidor (podem ser
 * importados por componentes cliente). As funções de leitura (Supabase) vivem
 * em `store.ts`, que importa estas constantes.
 */

export const TARGET_CATEGORIES = [
  "global",
  "oculos_graduados",
  "oculos_sol",
  "lentes_contacto",
  "saude_ocular",
] as const;

export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export const TARGET_LABELS: Record<TargetCategory, string> = {
  global: "Objetivo do Mês",
  oculos_graduados: "Óculos Graduados",
  oculos_sol: "Óculos de Sol",
  lentes_contacto: "Lentes de Contacto",
  saude_ocular: "Saúde Ocular",
};

/** Objetivos (€) de um mês, só as categorias que têm valor definido. */
export type MonthlyTargets = Partial<Record<TargetCategory, number>>;
