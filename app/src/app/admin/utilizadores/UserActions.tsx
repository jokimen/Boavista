"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { PermissionsModal } from "./PermissionsModal";
import type { Permission, UserRole } from "@/types";

interface UserActionsProps {
  userId: string;
  userName: string;
  isActive: boolean;
  role: UserRole;
  permissions: Permission[];
}

export function UserActions({ userId, userName, isActive, role, permissions }: UserActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPerms, setShowPerms] = useState(false);

  async function toggleActive() {
    setLoading(true);
    try {
      await fetch(`/api/admin/users/${userId}/toggle-active`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (role === "superadmin") {
    return <span className="text-xs text-text-muted">—</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant={isActive ? "ghost" : "primary"} size="sm" loading={loading} onClick={toggleActive}>
        {isActive ? "Desativar" : "Aprovar"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setShowPerms(true)} title="Editar permissões">
        <SlidersHorizontal size={14} />
        Permissões
      </Button>
      <PermissionsModal
        userId={userId}
        userName={userName}
        role={role}
        current={permissions}
        open={showPerms}
        onClose={() => setShowPerms(false)}
      />
    </div>
  );
}
