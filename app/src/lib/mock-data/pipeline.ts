import type { Order, PipelineStage } from "@/types";

export function mockPipeline(): PipelineStage[] {
  return [
    { status: "consulta_marcada", label: "Consultas Marcadas", count: 18, value: 0 },
    { status: "consulta_realizada", label: "Consultas Realizadas", count: 14, value: 0 },
    { status: "orcamento_emitido", label: "Orçamentos Emitidos", count: 11, value: 12_650 },
    { status: "orcamento_aceite", label: "Orçamentos Aceites", count: 7, value: 8_900 },
    { status: "em_producao", label: "Em Produção", count: 6, value: 7_200 },
    { status: "pronta_entrega", label: "Prontas para Entrega", count: 4, value: 4_800 },
    { status: "entregue", label: "Entregues", count: 3, value: 3_450 },
  ];
}

export function mockOrders(): Order[] {
  const now = new Date();
  function daysAgo(n: number) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }
  function daysFromNow(n: number) {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  }

  return [
    {
      id: "o1", client_id: "c1", client_name: "Miguel Oliveira",
      status: "em_producao", amount: 680, created_at: daysAgo(12),
      expected_delivery: daysAgo(2), delivered_at: null, days_in_status: 12, is_overdue: true,
    },
    {
      id: "o2", client_id: "c2", client_name: "Sofia Carvalho",
      status: "pronta_entrega", amount: 420, created_at: daysAgo(18),
      expected_delivery: daysAgo(3), delivered_at: null, days_in_status: 18, is_overdue: true,
    },
    {
      id: "o3", client_id: "c3", client_name: "Rui Santos",
      status: "orcamento_emitido", amount: 390, created_at: daysAgo(5),
      expected_delivery: null, delivered_at: null, days_in_status: 5, is_overdue: false,
    },
    {
      id: "o4", client_id: "c4", client_name: "Catarina Lima",
      status: "orcamento_emitido", amount: 870, created_at: daysAgo(4),
      expected_delivery: null, delivered_at: null, days_in_status: 4, is_overdue: false,
    },
    {
      id: "o5", client_id: "c5", client_name: "Pedro Neves",
      status: "em_producao", amount: 540, created_at: daysAgo(7),
      expected_delivery: daysFromNow(3), delivered_at: null, days_in_status: 7, is_overdue: false,
    },
    {
      id: "o6", client_id: "c6", client_name: "Ana Rodrigues",
      status: "pronta_entrega", amount: 320, created_at: daysAgo(20),
      expected_delivery: daysAgo(5), delivered_at: null, days_in_status: 20, is_overdue: true,
    },
    {
      id: "o7", client_id: "c7", client_name: "Filipe Mendes",
      status: "orcamento_aceite", amount: 1_200, created_at: daysAgo(3),
      expected_delivery: daysFromNow(10), delivered_at: null, days_in_status: 3, is_overdue: false,
    },
  ].map((o, i) => ({ ...o, client_contact: `9120000${i}0` })) as Order[];
}
