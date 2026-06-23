import type { Client } from "@/types";

export function mockClients(): Client[] {
  return [
    {
      id: "c1", name: "Miguel Oliveira", email: "miguel@email.com", phone: "912345678",
      birthdate: "1985-03-15", last_purchase: "2026-05-10", days_since_purchase: 20,
      graduation_date: "2023-04-20", total_spent: 2_840, num_purchases: 6, avg_ticket: 473,
      is_contact_lens_user: false, tags: ["vip", "graduados"],
    },
    {
      id: "c2", name: "Sofia Carvalho", email: "sofia@email.com", phone: "913456789",
      birthdate: "1992-07-22", last_purchase: "2026-04-15", days_since_purchase: 45,
      graduation_date: "2022-09-10", total_spent: 1_920, num_purchases: 4, avg_ticket: 480,
      is_contact_lens_user: true, next_lens_refill: "2026-06-15", tags: ["lentes_contacto"],
    },
    {
      id: "c3", name: "Rui Santos", email: "rui@email.com", phone: "914567890",
      birthdate: "1978-11-03", last_purchase: "2025-11-20", days_since_purchase: 191,
      graduation_date: "2021-05-12", total_spent: 4_200, num_purchases: 8, avg_ticket: 525,
      is_contact_lens_user: false, tags: ["inativo", "graduacao_antiga"],
    },
    {
      id: "c4", name: "Catarina Lima", email: "catarina@email.com", phone: "915678901",
      birthdate: "1995-01-30", last_purchase: "2026-05-22", days_since_purchase: 8,
      graduation_date: "2024-01-15", total_spent: 890, num_purchases: 2, avg_ticket: 445,
      is_contact_lens_user: true, next_lens_refill: "2026-07-22", tags: ["novo", "lentes_contacto"],
    },
    {
      id: "c5", name: "Pedro Neves", email: null, phone: "916789012",
      birthdate: "1970-05-08", last_purchase: "2024-08-10", days_since_purchase: 658,
      graduation_date: "2020-03-05", total_spent: 6_500, num_purchases: 12, avg_ticket: 542,
      is_contact_lens_user: false, tags: ["perdido", "graduacao_antiga"],
    },
    {
      id: "c6", name: "Ana Rodrigues", email: "ana.rodrigues@email.com", phone: "917890123",
      birthdate: "1988-09-14", last_purchase: "2026-03-05", days_since_purchase: 86,
      graduation_date: "2023-10-20", total_spent: 3_100, num_purchases: 5, avg_ticket: 620,
      is_contact_lens_user: false, tags: ["vip", "sol"],
    },
    {
      id: "c7", name: "Filipe Mendes", email: "filipe@email.com", phone: "918901234",
      birthdate: "1982-12-20", last_purchase: "2026-05-28", days_since_purchase: 2,
      graduation_date: "2025-12-20", total_spent: 1_200, num_purchases: 1, avg_ticket: 1200,
      is_contact_lens_user: false, tags: ["novo"],
    },
    {
      id: "c8", name: "Luísa Pinto", email: "luisa@email.com", phone: "919012345",
      birthdate: "1990-06-25", last_purchase: "2025-05-10", days_since_purchase: 385,
      graduation_date: "2022-06-01", total_spent: 2_400, num_purchases: 3, avg_ticket: 800,
      is_contact_lens_user: true, tags: ["inativo", "lentes_contacto"],
    },
  ];
}
