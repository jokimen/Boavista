import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./session-cookie";
import { adminDb } from "@/lib/firebase/admin";
import { getDefaultPermissions } from "./permissions";
import { TWOFA_COOKIE, isTwofaValid } from "./twofa-session";
import type { ModuleKey, Permission, UserRole } from "@/types";

export interface SessionContext {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  totpEnabled: boolean;
  /** Permissões efetivas (defaults do role sobrepostos pelas linhas da BD). */
  permissions: Permission[];
}

/**
 * Calcula as permissões efetivas: parte dos defaults do role e sobrepõe com as
 * linhas guardadas no documento do perfil. O superadmin tem sempre acesso total.
 */
export function getEffectivePermissions(
  role: UserRole,
  rows: { module: string; can_view: boolean; can_export: boolean }[],
): Permission[] {
  const defaults = getDefaultPermissions(role);
  if (role === "superadmin") return defaults; // acesso total, imutável
  const map = new Map<ModuleKey, Permission>(defaults.map((p) => [p.module, { ...p }]));
  for (const r of rows) {
    const cur = map.get(r.module as ModuleKey);
    if (cur) {
      cur.can_view = r.can_view;
      cur.can_export = r.can_export;
    }
  }
  return [...map.values()];
}

/** Obtém o contexto de sessão (utilizador + perfil + permissões). Redireciona para /login se não autenticado. */
export async function getSession(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const sessionVal = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySession(sessionVal);

  if (!session) redirect("/login");

  // Leitura de perfil do Firestore com tolerância a falha transitória (retry)
  let profile: any = null;
  let readOk = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await adminDb.collection("profiles").doc(session.userId).get();
      if (doc.exists) {
        profile = doc.data();
        readOk = true;
        break;
      }
    } catch (e) {
      if (attempt === 1) {
        console.error("getSession perfil falhou (re-autenticar):", e instanceof Error ? e.message : e);
      }
    }
  }

  if (!readOk || !profile) redirect("/login");

  // Defesa em profundidade (além do proxy): conta ativa + 2FA concluído.
  if (!profile.is_active) redirect("/login");
  if (!profile.totp_enabled) redirect("/2fa/setup");
  if (!isTwofaValid(cookieStore.get(TWOFA_COOKIE)?.value, session.userId)) redirect("/2fa");

  const role = (profile.role ?? "commercial") as UserRole;
  const permissionsList = profile.permissions ?? [];

  return {
    userId: session.userId,
    email: session.email,
    name: profile.name ?? session.email ?? "Utilizador",
    role,
    isActive: profile.is_active ?? false,
    totpEnabled: profile.totp_enabled ?? false,
    permissions: getEffectivePermissions(role, permissionsList),
  };
}
