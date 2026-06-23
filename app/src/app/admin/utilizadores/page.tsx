import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { TopBar } from "@/components/layout/TopBar";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { InviteButton } from "./InviteButton";
import { UserActions } from "./UserActions";
import type { Permission } from "@/types";

export default async function UtilizadoresPage() {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  // Ordenação por created_at em JS (alguns perfis — ex.: superadmin — podem não ter o campo).
  const ts = (v: unknown) => (typeof v === "string" ? new Date(v).getTime() || 0 : 0);

  const usersSnap = await adminDb.collection("profiles").get();
  const users = usersSnap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        name: v.name ?? "",
        email: v.email ?? "",
        role: v.role ?? "commercial",
        is_active: v.is_active ?? false,
        totp_enabled: v.totp_enabled ?? false,
        created_at: v.created_at ?? "",
      };
    })
    .sort((a, b) => ts(b.created_at) - ts(a.created_at));

  // As permissões vivem embutidas no documento de perfil (ver session.ts).
  const permsByUser = new Map<string, { module: string; can_view: boolean; can_export: boolean }[]>();
  for (const d of usersSnap.docs) {
    const arr = Array.isArray(d.data().permissions) ? d.data().permissions : [];
    permsByUser.set(d.id, arr);
  }

  const invitesSnap = await adminDb.collection("invite_codes").get();
  const invites = invitesSnap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        code: v.code ?? d.id,
        used_by: v.used_by ?? null,
        expires_at: v.expires_at ?? "",
        created_at: v.created_at ?? "",
      };
    })
    .sort((a, b) => ts(b.created_at) - ts(a.created_at))
    .slice(0, 10);

  const roleLabels: Record<string, string> = {
    superadmin: "Superadmin", admin: "Admin", commercial: "Comercial",
  };
  const roleVariants: Record<string, "success" | "info" | "warning"> = {
    superadmin: "success", admin: "info", commercial: "warning",
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Gestão de Utilizadores" subtitle="Aprovações, permissões e convites" backHref="/admin" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex justify-end">
          <InviteButton />
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Utilizadores</h3>
          <DataTable
            data={users ?? []}
            keyField="id"
            columns={[
              { key: "name", label: "Nome" },
              { key: "email", label: "Email", render: r => <span className="text-text-secondary">{r.email}</span> },
              {
                key: "role", label: "Role",
                render: r => <Badge variant={roleVariants[r.role] ?? "outline"}>{roleLabels[r.role] ?? r.role}</Badge>
              },
              {
                key: "is_active", label: "Estado",
                render: r => <Badge variant={r.is_active ? "success" : "warning"}>{r.is_active ? "Ativo" : "Pendente"}</Badge>
              },
              {
                key: "totp_enabled", label: "2FA",
                render: r => <Badge variant={r.totp_enabled ? "success" : "danger"}>{r.totp_enabled ? "Ativo" : "Inativo"}</Badge>
              },
              {
                key: "created_at", label: "Criado em",
                render: r => <span className="text-text-muted">{new Date(r.created_at).toLocaleDateString("pt-PT")}</span>
              },
              {
                key: "actions", label: "Ações",
                render: r => (
                  <UserActions
                    userId={r.id}
                    userName={r.name ?? r.email}
                    isActive={r.is_active}
                    role={r.role}
                    permissions={(permsByUser.get(r.id) ?? []) as Permission[]}
                  />
                )
              },
            ]}
          />
        </div>

        <div className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Códigos de Convite Recentes</h3>
          <DataTable
            data={invites ?? []}
            keyField="id"
            columns={[
              { key: "code", label: "Código", render: r => <code className="text-[#3b82f6] font-mono">{r.code}</code> },
              {
                key: "used_by", label: "Estado",
                render: r => <Badge variant={r.used_by ? "success" : r.expires_at < new Date().toISOString() ? "danger" : "info"}>
                  {r.used_by ? "Usado" : r.expires_at < new Date().toISOString() ? "Expirado" : "Disponível"}
                </Badge>
              },
              { key: "expires_at", label: "Expira em", render: r => new Date(r.expires_at).toLocaleDateString("pt-PT") },
              { key: "created_at", label: "Criado em", render: r => new Date(r.created_at).toLocaleDateString("pt-PT") },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
