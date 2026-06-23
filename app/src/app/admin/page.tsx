import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import Link from "next/link";
import { Users, Key, FileText, Activity, Target, Factory, ShieldCheck } from "lucide-react";

export default async function AdminPage() {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  const [usersCount, invitesCount, logsCount] = await Promise.all([
    adminDb.collection("profiles").count().get().then((s) => s.data().count).catch(() => 0),
    adminDb.collection("invite_codes").where("used_by", "==", null).count().get().then((s) => s.data().count).catch(() => 0),
    adminDb.collection("audit_logs").count().get().then((s) => s.data().count).catch(() => 0),
  ]);

  const cards = [
    { icon: Users, label: "Utilizadores", value: usersCount, href: "/admin/utilizadores" },
    { icon: Key, label: "Convites ativos", value: invitesCount, href: "/admin/utilizadores" },
    { icon: FileText, label: "Entradas de auditoria", value: logsCount, href: "/admin/auditoria" },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Superadmin" subtitle="Backoffice de gestão e controlo" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map(card => (
            <Link key={card.href} href={card.href} className="block">
              <div className="rounded-xl bg-bg-card border border-border p-4 hover:bg-bg-card-hover hover:border-border-subtle transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-border-subtle border border-[#3b82f6]/20">
                    <card.icon size={16} className="text-[#3b82f6]" />
                  </div>
                  <span className="text-sm text-text-secondary">{card.label}</span>
                </div>
                <p className="text-2xl font-bold text-text-primary">{card.value}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { href: "/admin/objetivos", icon: Target, label: "Objetivos", desc: "Definir objetivos mensais por categoria e produtos de saúde ocular" },
            { href: "/admin/fornecedores", icon: Factory, label: "Fornecedores", desc: "Grupo, objetivo de compra e % de rappel por fornecedor" },
            { href: "/admin/seguradoras", icon: ShieldCheck, label: "Seguradoras", desc: "Rotular os códigos de seguradora do Visual (Multicare, Medis…) para os relatórios" },
            { href: "/admin/utilizadores", icon: Users, label: "Gestão de Utilizadores", desc: "Aprovar, rejeitar e gerir permissões de utilizadores" },
            { href: "/admin/auditoria", icon: Activity, label: "Logs de Auditoria", desc: "Registo de todas as ações realizadas no sistema" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <div className="rounded-xl bg-bg-card border border-border p-4 hover:bg-bg-card-hover hover:border-border-subtle transition-colors flex items-start gap-4 cursor-pointer">
                <div className="p-2 rounded-lg bg-border">
                  <item.icon size={18} className="text-text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
