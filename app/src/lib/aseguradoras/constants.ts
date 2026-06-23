/** Constantes/tipos de seguradoras — SEM dependências de servidor (client-safe). */

export interface AseguradoraRow {
  nome: string;
  ativo: boolean;
}

/** Config indexada por código de seguradora (Codigo_aseguradora do Visual). */
export type AseguradoraConfig = Record<string, AseguradoraRow>;

/** Nome a mostrar para um código: o configurado, ou "Seguro <cod>" como fallback. */
export function aseguradoraLabel(config: AseguradoraConfig, codigo: string): string {
  const c = config[String(codigo)];
  return c?.nome?.trim() || `Seguro ${codigo}`;
}
