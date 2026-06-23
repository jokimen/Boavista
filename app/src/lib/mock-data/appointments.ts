import type { Appointment } from "@/types";

export function mockAppointments(_from: string, _to: string): Appointment[] {
  const today = new Date().toISOString().split("T")[0];
  return [
    { id: "a1", client_id: "c1", client_name: "Miguel Oliveira", employee_id: "e1", employee_name: "Ana Silva", date: `${today}T09:00:00`, type: "consulta", status: "realizada", converted_to_sale: true, sale_amount: 680 },
    { id: "a2", client_id: "c3", client_name: "Rui Santos", employee_id: "e2", employee_name: "João Costa", date: `${today}T10:30:00`, type: "consulta", status: "realizada", converted_to_sale: false },
    { id: "a3", client_id: "c4", client_name: "Catarina Lima", employee_id: "e1", employee_name: "Ana Silva", date: `${today}T11:00:00`, type: "entrega", status: "marcada", converted_to_sale: false },
    { id: "a4", client_id: "c6", client_name: "Ana Rodrigues", employee_id: "e3", employee_name: "Marta Ferreira", date: `${today}T14:00:00`, type: "consulta", status: "marcada", converted_to_sale: false },
    { id: "a5", client_id: "c7", client_name: "Filipe Mendes", employee_id: "e2", employee_name: "João Costa", date: `${today}T15:30:00`, type: "consulta", status: "falta", converted_to_sale: false },
    { id: "a6", client_id: "c2", client_name: "Sofia Carvalho", employee_id: "e1", employee_name: "Ana Silva", date: `${today}T16:00:00`, type: "ajuste", status: "marcada", converted_to_sale: false },
  ];
}
