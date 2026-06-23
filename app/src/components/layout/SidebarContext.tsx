"use client";

import { createContext, useContext, useState } from "react";

interface SidebarCtx {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const Ctx = createContext<SidebarCtx>({ mobileOpen: false, setMobileOpen: () => {} });

/** Provider do estado do drawer móvel do sidebar (envolve Sidebar + páginas/TopBar). */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <Ctx.Provider value={{ mobileOpen, setMobileOpen }}>{children}</Ctx.Provider>;
}

export function useSidebar() {
  return useContext(Ctx);
}
