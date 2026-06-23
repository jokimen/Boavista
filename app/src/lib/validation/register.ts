import { z } from "zod";

/** Validação do registo por convite (server-side). */
export const registerSchema = z.object({
  code: z.string().trim().min(4, "Código inválido").max(64),
  name: z.string().trim().min(2, "Nome demasiado curto").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(200),
  password: z.string().min(8, "A password deve ter pelo menos 8 caracteres").max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;
