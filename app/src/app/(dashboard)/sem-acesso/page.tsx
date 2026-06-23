import { ShieldAlert } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";

export default function SemAcessoPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Sem acesso" subtitle="Permissões insuficientes" />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-danger-bg/30 border border-[#ef4444]/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={26} className="text-[#ef4444]" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Acesso negado</h2>
          <p className="text-sm text-text-secondary">
            Não tens permissão para ver este módulo. Se precisares de acesso, contacta o
            administrador para que to atribua.
          </p>
        </div>
      </div>
    </div>
  );
}
