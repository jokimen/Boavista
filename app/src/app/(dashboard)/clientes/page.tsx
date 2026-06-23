import { Suspense } from "react";
import { requireModule } from "@/lib/auth/guard";
import { TopBar } from "@/components/layout/TopBar";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { ExportData } from "@/components/tables/ExportData";
import { canExport } from "@/lib/auth/permissions";
import { fetchClients, fetchContactLensClients, fetchClinicalRecall } from "@/lib/api/adapter";

export default async function ClientesPage() {
  const session = await requireModule("clientes");
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Clientes e Fidelização" subtitle="Gestão e oportunidades comerciais" />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Suspense fallback={<div className="text-sm text-text-muted py-10 text-center">A carregar clientes e fidelização…</div>}>
          <ClientesContent canExportClients={canExport(session.permissions, "clientes")} />
        </Suspense>
        <Suspense fallback={<div className="rounded-xl bg-bg-card border border-border p-4 text-xs text-text-muted">A calcular recall clínico (optometria / contactologia)…</div>}>
          <RecallSection />
        </Suspense>
      </div>
    </div>
  );
}

async function RecallSection() {
  const recall = await fetchClinicalRecall();
  const sections = [
    { titulo: "Recall Optometria — sem óculos graduados há +2 anos", rows: recall.optometria, cor: "#3b82f6" },
    { titulo: "Recall Contactologia — sem lentes de contacto há +1 ano", rows: recall.contactologia, cor: "#ec4899" },
  ] as const;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {sections.map((sec) => (
        <div key={sec.titulo} className="rounded-xl bg-bg-card border border-border p-4">
          <h3 className="text-sm font-semibold mb-1" style={{ color: sec.cor }}>{sec.titulo}</h3>
          <p className="text-xs text-text-muted mb-3">{sec.rows.length} cliente(s) a contactar. Proxy: última consulta ≈ última compra do tipo.</p>
          <DataTable
            data={sec.rows.slice(0, 200).map((r) => ({ ...r, id: r.client_id }))}
            keyField="id"
            maxHeight="max-h-80"
            columns={[
              { key: "client_name", label: "Cliente" },
              { key: "client_contact", label: "Contacto", render: r => r.client_contact
                ? <a href={`tel:${r.client_contact}`} className="text-[#3b82f6] hover:underline">{r.client_contact}</a>
                : <span className="text-text-muted">—</span> },
              { key: "last_date", label: "Última", render: r => r.last_date ? new Date(r.last_date).toLocaleDateString("pt-PT") : "—" },
              { key: "days_since", label: "Há", sortable: true, render: r => <span className="text-[#f59e0b]">{Math.floor(r.days_since / 30)} meses</span> },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

async function ClientesContent({ canExportClients }: { canExportClients: boolean }) {
  const [clients, lc] = await Promise.all([fetchClients(), fetchContactLensClients()]);

  // Novos = clientes com DATA DE ALTA no mês civil corrente (não recência de compra).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = clients.filter(c => {
    if (!c.registration_date) return false;
    const d = new Date(c.registration_date);
    return d >= monthStart && d <= now;
  });
  const inactive12 = clients.filter(c => c.days_since_purchase >= 365);
  const inactive18 = clients.filter(c => c.days_since_purchase >= 548);
  const lensRefillSoon = clients.filter(c => c.next_lens_refill);
  const nowMs = new Date().getTime();
  const oldGraduation = clients.filter(c => {
    if (!c.graduation_date) return false;
    const days = Math.floor((nowMs - new Date(c.graduation_date).getTime()) / 86400000);
    return days > 1095;
  });

  return (
    <>
        <div className="flex justify-end">
          <ExportData
            title="Clientes"
            canExport={canExportClients}
            columns={[
              { key: "name", label: "Nome" },
              { key: "phone", label: "Telefone" },
              { key: "email", label: "Email" },
              { key: "total_spent", label: "Total Gasto" },
              { key: "num_purchases", label: "Compras" },
              { key: "avg_ticket", label: "Ticket Médio" },
              { key: "last_purchase", label: "Última Compra" },
              { key: "days_since_purchase", label: "Dias desde compra" },
              { key: "tags", label: "Tags" },
            ]}
            rows={clients}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <KpiCard data={{ label: "Total Clientes", value: clients.length, unit: "" }} />
          <KpiCard data={{ label: "Novos este Mês", value: newThisMonth.length, unit: "", infoId: "clientes-novos" }} />
          <KpiCard data={{ label: "Inativos +12m", value: inactive12.length, unit: "" }} />
          <KpiCard data={{ label: "Inativos +18m", value: inactive18.length, unit: "" }} />
          <KpiCard data={{ label: "Graduação +3 anos", value: oldGraduation.length, unit: "" }} />
          <KpiCard data={{ label: "Lentes a Acabar", value: lensRefillSoon.length, unit: "" }} />
        </div>

        {/* Contact lens refill alert — caixa de altura fixa com scroll interno + export */}
        {lensRefillSoon.length > 0 && (
          <div className="rounded-xl bg-warning-bg/20 border border-[#f59e0b]/30 p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-semibold text-[#f59e0b]">
                Clientes com lentes de contacto prestes a acabar — contactar agora
                <span className="ml-2 text-xs font-normal text-text-muted">({lensRefillSoon.length})</span>
              </h3>
              <ExportData
                title="LC a contactar"
                canExport={canExportClients}
                columns={[
                  { key: "name", label: "Cliente" },
                  { key: "phone", label: "Telefone" },
                  { key: "email", label: "Email" },
                  { key: "next_lens_refill", label: "Reabastecimento" },
                ]}
                rows={lensRefillSoon}
              />
            </div>
            <DataTable
              data={lensRefillSoon}
              keyField="id"
              maxHeight="max-h-72"
              columns={[
                { key: "name", label: "Cliente" },
                { key: "phone", label: "Telefone" },
                { key: "email", label: "Email", render: r => <span className="text-text-secondary">{r.email ?? "—"}</span> },
                { key: "next_lens_refill", label: "Reabastecimento", render: r => r.next_lens_refill ? new Date(r.next_lens_refill).toLocaleDateString("pt-PT") : "—" },
              ]}
            />
          </div>
        )}

        {/* Lentes de Contacto — reposição (diárias / mensais) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {([
            { titulo: "Lentes de Contacto — Diárias", rows: lc.diarias, hint: "cx30 → +30 dias · cx90 → +90 dias" },
            { titulo: "Lentes de Contacto — Mensais", rows: lc.mensais, hint: "cx3 → +90 dias · cx6 → +180 dias" },
          ] as const).map((sec) => (
            <div key={sec.titulo} className="rounded-xl bg-bg-card border border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary">{sec.titulo}</h3>
              <p className="text-xs text-text-muted mb-3">{sec.hint} · data prevista a partir da entrega. Só clientes com compra de LC há &lt; 14 meses.</p>
              <DataTable
                data={sec.rows.map((r) => ({ ...r, id: r.client_id }))}
                keyField="id"
                maxHeight="max-h-80"
                columns={[
                  { key: "client_name", label: "Cliente" },
                  { key: "client_contact", label: "Contacto", render: r => r.client_contact
                    ? <a href={`tel:${r.client_contact}`} className="text-[#3b82f6] hover:underline">{r.client_contact}</a>
                    : <span className="text-text-muted">—</span> },
                  { key: "box", label: "Caixa", render: r => <Badge variant="outline">{r.box}</Badge> },
                  { key: "last_purchase", label: "Última", render: r => r.last_purchase ? new Date(r.last_purchase).toLocaleDateString("pt-PT") : "—" },
                  { key: "predicted_purchase", label: "Prevista", sortable: true, render: r => (
                    <Badge variant={r.days_until < 0 ? "danger" : r.days_until <= 15 ? "warning" : "success"}>
                      {r.predicted_purchase ? new Date(r.predicted_purchase).toLocaleDateString("pt-PT") : "—"}
                    </Badge>
                  ) },
                ]}
              />
            </div>
          ))}
        </div>

    </>
  );
}
