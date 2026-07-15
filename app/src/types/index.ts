// ─── Auth & Permissions ──────────────────────────────────────────────────────

export type UserRole = "superadmin" | "admin" | "commercial";

export type ModuleKey =
  | "dashboard"
  | "hoje"
  | "mes"
  | "vendas"
  | "faturacao"
  | "caixa"
  | "pipeline"
  | "stock"
  | "clientes"
  | "equipa"
  | "descontos"
  | "entidades"
  | "operacao"
  | "fornecedores"
  | "alertas"
  | "admin";

export interface Permission {
  module: ModuleKey;
  can_view: boolean;
  can_export: boolean;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  totp_enabled: boolean;
  permissions: Permission[];
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  ip: string;
  created_at: string;
}

// ─── KPI & Filters ───────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

export interface GlobalFilters {
  dateRange: DateRange;
  employee: string | null;
  category: string | null;
}

export interface KpiData {
  label: string;
  value: number | string;
  unit?: "€" | "%" | "";
  change?: number;
  changePeriod?: string;
  sparkline?: number[];
  target?: number;
  targetPct?: number;
  /** Id de explicação (ChartInfo) — mostra um "i" que abre como se calcula o KPI. */
  infoId?: string;
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export type SaleCategory =
  | "lentes_oftalmicas"
  | "armacoes"
  | "oculos_sol"
  | "lentes_contacto"
  | "saude_ocular"
  | "diversos";

export interface Sale {
  id: string;
  date: string;
  category: SaleCategory;
  amount: number;
  cost: number;
  margin: number;
  margin_pct: number;
  discount: number;
  discount_pct: number;
  employee_id: string;
  client_id: string;
  brand?: string;
  model?: string;
}

export interface SalesSummary {
  total_sales: number;
  total_cost: number;
  total_margin: number;
  margin_pct: number;
  /** % do valor de venda com custo conhecido (cobertura da margem). 100 = tudo coberto. */
  cobertura_pct: number;
  avg_ticket: number;
  num_sales: number;
  total_discount: number;
  conversion_rate: number;
}

// ─── Orders / Pipeline ───────────────────────────────────────────────────────

export type OrderStatus =
  | "consulta_marcada"
  | "consulta_realizada"
  | "orcamento_emitido"
  | "orcamento_aceite"
  | "em_producao"
  | "pronta_entrega"
  | "entregue";

export interface Order {
  id: string;
  client_id: string;
  client_name: string;
  client_contact: string;
  status: OrderStatus;
  amount: number;
  created_at: string;
  expected_delivery: string | null;
  delivered_at: string | null;
  days_in_status: number;
  is_overdue: boolean;
}

export interface PipelineStage {
  status: OrderStatus;
  label: string;
  count: number;
  value: number;
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export interface StockItem {
  id: string;
  brand: string;
  model: string;
  category: SaleCategory;
  cost: number;
  price: number;
  margin_pct: number;
  quantity: number;
  last_sale_date: string | null;
  days_without_sale: number;
  /** Última entrada em stock e dias desde então ("Parado Há" = desde a última entrada). */
  last_entry_date: string | null;
  days_since_entry: number;
  /** Código de artigo (para abrir histórico de movimentos). */
  codigo: string;
  /** Taxonomia do maestro (Familia_agrupacion1/2/3): tipo, material, género. Opcionais
   * — snapshots antigos não os têm até o cron de stock re-correr. */
  type?: string;
  material?: string;
  gender?: string;
}

export interface StockSummary {
  total_items: number;
  total_value_cost: number;
  total_value_sale: number;
  items_90d: number;
  items_180d: number;
  items_365d: number;
  avg_age_days: number;
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  /** Data de alta do cliente (Fecha_alta no Visual) — para "clientes novos". */
  registration_date?: string | null;
  last_purchase: string | null;
  days_since_purchase: number;
  graduation_date: string | null;
  total_spent: number;
  num_purchases: number;
  avg_ticket: number;
  is_contact_lens_user: boolean;
  next_lens_refill?: string;
  tags: string[];
}

// ─── Employees ───────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  role: string;
  monthly_target: number;
  sales_month: number;
  margin_month: number;
  avg_ticket: number;
  discount_avg: number;
  quotes_issued: number;
  quotes_converted: number;
  conversion_rate: number;
}

// ─── Appointments ────────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  client_id: string;
  client_name: string;
  employee_id: string;
  employee_name: string;
  date: string;
  type: "consulta" | "entrega" | "ajuste";
  status: "marcada" | "realizada" | "falta" | "cancelada";
  converted_to_sale: boolean;
  sale_amount?: number;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  module: string;
  message: string;
  detail?: string;
  action_url?: string;
  created_at: string;
  is_read: boolean;
}
