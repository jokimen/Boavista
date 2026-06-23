"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { ModuleKey, Permission, UserRole } from "@/types";

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "hoje", label: "Hoje" },
  { key: "mes", label: "Mês" },
  { key: "vendas", label: "Vendas" },
  { key: "pipeline", label: "Pipeline" },
  { key: "consultas", label: "Consultas" },
  { key: "stock", label: "Stock" },
  { key: "clientes", label: "Clientes" },
  { key: "equipa", label: "Equipa" },
  { key: "descontos", label: "Descontos" },
  { key: "operacao", label: "Operação" },
  { key: "alertas", label: "Alertas" },
];

interface Props {
  userId: string;
  userName: string;
  role: UserRole;
  current: Permission[];
  open: boolean;
  onClose: () => void;
}

export function PermissionsModal({ userId, userName, role, current, open, onClose }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(role);
  const [perms, setPerms] = useState<Record<string, { can_view: boolean; can_export: boolean }>>(() => {
    const map: Record<string, { can_view: boolean; can_export: boolean }> = {};
    for (const m of MODULES) {
      const found = current.find((p) => p.module === m.key);
      map[m.key] = { can_view: found?.can_view ?? false, can_export: found?.can_export ?? false };
    }
    return map;
  });

  function toggle(module: ModuleKey, field: "can_view" | "can_export") {
    setPerms((prev) => {
      const next = { ...prev[module], [field]: !prev[module][field] };
      // exportar implica ver
      if (field === "can_export" && next.can_export) next.can_view = true;
      if (field === "can_view" && !next.can_view) next.can_export = false;
      return { ...prev, [module]: next };
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          permissions: MODULES.map((m) => ({ module: m.key, ...perms[m.key] })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Erro ao guardar.");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Permissões — ${userName}`} size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary">Role</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
            className="bg-border border border-border-subtle rounded-lg text-text-primary text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/50"
          >
            <option value="commercial">Comercial</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-border text-text-secondary">
                <th className="text-left font-medium px-4 py-2">Módulo</th>
                <th className="text-center font-medium px-4 py-2 w-24">Ver</th>
                <th className="text-center font-medium px-4 py-2 w-28">Exportar</th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key} className="border-t border-border">
                  <td className="px-4 py-2 text-text-primary">{m.label}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={perms[m.key].can_view}
                      onChange={() => toggle(m.key, "can_view")}
                      className="h-4 w-4 accent-[#3b82f6] cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={perms[m.key].can_export}
                      onChange={() => toggle(m.key, "can_export")}
                      className="h-4 w-4 accent-[#3b82f6] cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="text-sm text-[#ef4444]">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}
