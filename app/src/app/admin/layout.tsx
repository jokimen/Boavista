import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar userName={session.name ?? "Superadmin"} userRole="superadmin" isSuperAdmin />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
