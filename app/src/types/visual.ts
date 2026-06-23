/**
 * Tipos das entidades da API do Visual (Temática Software — VGOnlineLink).
 * Fonte: documento "Enlace de Visual con tiendas online (API)".
 *
 * Notas:
 * - A API devolve quase todos os valores como strings (JSON), mesmo números e
 *   datas. Os tipos abaixo refletem isso (string) e a conversão é feita na
 *   camada de mapeamento (ver `lib/api/visual-map.ts`).
 * - Datas em respostas vêm como ISO-ish ("2019-06-05T13:10:35"); em filtros
 *   usam o formato 'DD/MM/YYYY HH24:MI:SS' entre aspas.
 */

/** Nomes das tabelas consultáveis via /select. */
export type VisualTable =
  | "Agendas"
  | "Articulos"
  | "CapitulosCaja"
  | "Clientes"
  | "Cobros"
  | "EventosAgenda"
  | "FacturasClientes"
  | "MediosPago"
  | "Proveedores"
  | "PruebasLentillas"
  | "RevisionesLentes"
  | "RevisionesLentillas"
  | "StockArticulos"
  | "Ventas";

/** Tabelas que aceitam insert/update/delete. */
export type VisualWritableTable = "Clientes" | "Cobros" | "Ventas" | "EventosAgenda";

/** Resposta genérica do /select. */
export interface VisualSelectResponse<T> {
  dataset: string;
  data: T[];
}

/** Classe de produto do artigo. */
export type VisualClaseProducto =
  | "L" // Lente
  | "C" // Lentillas (lentes de contacto)
  | "G" // Gafas graduadas (óculos graduados)
  | "S" // Gafas de sol (óculos de sol)
  | "P"; // Otros productos

/** Estado de uma linha de venda (pipeline operacional). */
export type VisualEstadoLinea =
  | "E" // Producto entregado
  | "T" // Producto para entregar
  | "I" // Producto recibido
  | "H" // Pedido enviado al proveedor
  | "C" // Pedido pendiente de enviar
  | "K" // Pedido cancelado
  | "J" // Pedido parcialmente
  | "D"; // Devuelto

export interface VisualVentaLinea {
  Codigo_linea: string | number;
  Numero_encargo: string | number;
  /** Código do artigo de stock (armações/sol). Frequentemente null em lentes. */
  Codigo_articulo?: string | null;
  Centro_articulo?: string | number | null;
  /** Código do produto (chave quase universal; lentes usam catálogo de produtos). */
  Codigo_producto?: string | null;
  Centro_stock?: string | number | null;
  Descripcion?: string;
  Precio_unitario: string | number;
  Porcentaje_iva: string | number;
  Cantidad: string | number;
  Estado: VisualEstadoLinea;
  Importe_descuento: string | number;
  Fecha_entrega?: string | null;
  Observaciones?: string | null;
}

export interface VisualVenta {
  Codigo: string;
  Centro: string;
  Referencia: string;
  Usuario: string;
  Codigo_cliente: string;
  Centro_cliente: string;
  Fecha: string;
  Importe_bruto: string | number;
  Importe_DescuentoGlobal: string | number;
  Importe_IVA: string | number;
  Es_presupuesto: "S" | "N";
  Importe_pagado: string | number;
  Fecha_entrega?: string | null;
  Codigo_cliente_pagador?: string;
  Centro_cliente_pagador?: string;
  Importe_descuento_lineas: string | number;
  lineas: VisualVentaLinea[];
}

export interface VisualArticulo {
  Codigo: string;
  Centro: string;
  Descripcion?: string;
  /** Classe de produto. Campo real na API: `Clase_producto` (com underscore). */
  Clase_producto?: VisualClaseProducto;
  Familia_agrupacion1?: string;
  Familia_agrupacion2?: string;
  Familia_agrupacion3?: string;
  Producto?: string;
  Marca?: string;
  IVA?: string | number;
  Precio_compra?: string | number;
  Precio_venta?: string | number;
  Precio_venta2?: string | number;
  Existencias?: string | number;
  ExistenciasTotales?: string | number;
  FechaAlta?: string | null;
  FechaBaja?: string | null;
  UltimaActualizacion?: string | null;
  UltimaEntrada?: string | null;
}

export interface VisualCliente {
  Codigo: string;
  Centro: string;
  Fecha_alta?: string | null;
  Tipo_cliente?: "P" | "E";
  Apellido1?: string;
  Apellido2?: string;
  Nombre?: string;
  Sexo?: "M" | "F";
  Fecha_nacimiento?: string | null;
  Email?: string | null;
  Telefono?: string | null;
  Telefono_movil?: string | null;
  Desea_correo?: "S" | "N";
  Desea_SMS?: "S" | "N";
  // Nota: a tabela Clientes NÃO expõe data de última compra — derivar das Ventas.
  Fecha_proxrevlentes?: string | null;
  Fecha_proxrevlentillas?: string | null;
  Fecha_proxrevaudio?: string | null;
}

export interface VisualStockArticulo {
  Codigo: string;
  Centro: string;
  CentroStock: string;
  Existencias: string | number;
}

export interface VisualCobro {
  Codigo: string;
  Centro: string;
  Importe: string | number;
  Codigo_capitulo?: string;
  Usuario?: string;
  Codigo_venta?: string;
  Centro_venta?: string;
  Fecha?: string;
  Codigo_MedioPago?: string;
  Descripcion?: string;
  Referencia_ticket?: string;
}

export interface VisualFacturaCliente {
  Codigo: string;
  Centro: string;
  Fecha?: string;
  Referencia?: string;
  Codigo_cliente?: string;
  Centro_cliente?: string;
  Importe_bruto?: string | number;
  Importe_descuento?: string | number;
  Importe_neto?: string | number;
  Base_imponible?: string | number;
  Importe_IVA?: string | number;
}

export interface VisualEventoAgenda {
  Codigo: string;
  CodigoAgenda: string;
  Inicio: string;
  Fin: string;
  TituloCita: string;
  Localizacion?: string;
  DiaCompleto?: "S" | "N";
  Etiqueta?: string;
  CodigoCliente?: string;
  CentroCliente?: string;
  Usuario?: string;
  Descripcion?: string;
}

export interface VisualCapituloCaja {
  Codigo: string;
  Tipo_movimiento?: "S" | "E";
  Descripcion?: string;
}

export interface VisualMedioPago {
  Codigo: string;
  Descripcion?: string;
}
