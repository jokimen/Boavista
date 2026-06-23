import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { TopBar } from "@/components/layout/TopBar";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";

export default async function AuditoriaPage() {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  const snap = await adminDb
    .collection("audit_logs")
    .orderBy("created_at", "desc")
    .limit(200)
    .get();
  type LogDoc = { id: string; user_id?: string | null; action?: string; details?: string; ip?: string; created_at?: string };
  const rawLogs: LogDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogDoc, "id">) }));

  // Resolve nome/email do utilizador (Firestore não tem joins): batch getAll dos perfis.
  const userIds = [...new Set(rawLogs.map((l) => l.user_id).filter((v): v is string => typeof v === "string" && v.length > 0))];
  const profMap = new Map<string, { name?: string; email?: string }>();
  if (userIds.length) {
    const refs = userIds.map((id) => adminDb.collection("profiles").doc(id));
    const docs = await adminDb.getAll(...refs);
    for (const d of docs) if (d.exists) profMap.set(d.id, d.data() as { name?: string; email?: string });
  }
  const logs = rawLogs.map((l) => {
    const p = typeof l.user_id === "string" ? profMap.get(l.user_id) : undefined;
    return {
      id: l.id,
      created_at: l.created_at ?? "",
      action: l.action ?? "",
      details: l.details ?? "",
      ip: l.ip ?? "",
      profiles: { name: p?.name, email: p?.email },
    };
  });

  const actionLabels: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" | "outline" }> = {
    "2fa_setup": { label: "2FA configurado", variant: "success" },
    "2fa_verify": { label: "2FA verificado", variant: "info" },
    "invite_generated": { label: "Convite gerado", variant: "warning" },
    "user_approved": { label: "Utilizador aprovado", variant: "success" },
    "user_deactivated": { label: "Utilizador desativado", variant: "danger" },
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Logs de Auditoria" subtitle="Registo completo de ações no sistema" backHref="/admin" />
      <div className="flex-1 overflow-auto p-6">
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <DataTable
            data={(logs ?? []).map(l => {
              const joined = l as { profiles?: { name?: string; email?: string } };
              return {
                ...l,
                user_name: joined.profiles?.name ?? "—",
                user_email: joined.profiles?.email ?? "—",
              };
            })}
            keyField="id"
            maxHeight="max-h-[600px]"
            columns={[
              {
                key: "created_at", label: "Data/Hora",
                render: r => <span className="text-text-secondary font-mono text-xs">{new Date(r.created_at).toLocaleString("pt-PT")}</span>
              },
              { key: "user_name", label: "Utilizador" },
              {
                key: "action", label: "Ação",
                render: r => {
                  const cfg = actionLabels[r.action];
                  return cfg ? <Badge variant={cfg.variant}>{cfg.label}</Badge> : <Badge variant="outline">{r.action}</Badge>;
                }
              },
              { key: "details", label: "Detalhes", render: r => <span className="text-text-secondary text-xs">{r.details}</span> },
              { key: "ip", label: "IP", render: r => <span className="text-text-muted font-mono text-xs">{r.ip}</span> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
