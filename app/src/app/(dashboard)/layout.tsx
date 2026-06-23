import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { getSession } from "@/lib/auth/session";
import { allowedModules } from "@/lib/auth/guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(); // redireciona para /login se não autenticado

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden relative">
        <Sidebar
          userName={session.name}
          userRole={session.role}
          isSuperAdmin={session.role === "superadmin"}
          allowedModules={allowedModules(session)}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
