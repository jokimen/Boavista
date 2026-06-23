import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  label: string;
  /** Mantido por compatibilidade; a ordenação interativa foi movida para wrappers client. */
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  maxHeight?: string;
}

/**
 * Tabela de dados (server component). Recebe `render` por coluna — válido porque
 * é server→server. Para ordenação interativa ou clique em linha, usar um wrapper
 * client dedicado (ver EmployeeDrilldown como exemplo).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- utilitário genérico: aceita qualquer linha tipada nas páginas
export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  emptyMessage = "Sem dados.",
  maxHeight,
}: DataTableProps<T>) {
  return (
    <div className={cn("rounded-xl border border-border overflow-x-auto", maxHeight && `overflow-y-auto ${maxHeight}`)}>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="sticky top-0 bg-bg-sidebar border-b border-border z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap",
                  col.className,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-bg-card divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={String(row[keyField])} className="transition-colors hover:bg-bg-card-hover">
                {columns.map((col) => (
                  <td key={String(col.key)} className={cn("px-4 py-3 text-text-primary", col.className)}>
                    {col.render ? col.render(row) : String(row[String(col.key)] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
