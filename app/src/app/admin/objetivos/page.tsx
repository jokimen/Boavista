import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TopBar } from "@/components/layout/TopBar";
import { getMonthlyTargets, getSaudeOcularProducts, getEmployeeTargets } from "@/lib/targets/store";
import { fetchEmployees } from "@/lib/api/adapter";
import { TargetsForm } from "./TargetsForm";
import { EmployeeTargetsForm } from "./EmployeeTargetsForm";
import { SaudeOcularManager } from "./SaudeOcularManager";

export default async function ObjetivosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session.role !== "superadmin") redirect("/");

  const sp = await searchParams;
  const now = new Date();
  const year = Number(Array.isArray(sp.year) ? sp.year[0] : sp.year) || now.getFullYear();
  const month = Number(Array.isArray(sp.month) ? sp.month[0] : sp.month) || now.getMonth() + 1;

  const [targets, saudeProducts, employeeTargets, employees] = await Promise.all([
    getMonthlyTargets(year, month),
    getSaudeOcularProducts(),
    getEmployeeTargets(year, month),
    fetchEmployees().catch(() => [] as { value: string; label: string }[]),
  ]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <TopBar title="Objetivos" subtitle="Define os objetivos mensais por categoria e por vendedor (venda líquida)" backHref="/admin" />
      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-3xl">
        <TargetsForm year={year} month={month} targets={targets} />
        <EmployeeTargetsForm year={year} month={month} employees={employees.map((e) => e.value)} targets={employeeTargets} />
        <SaudeOcularManager products={saudeProducts} />
      </div>
    </div>
  );
}
