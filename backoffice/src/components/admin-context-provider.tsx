"use client";

import { createContext, useContext } from "react";
import type { AdminContextRecord } from "@/lib/admin-areas";

const AdminContext = createContext<AdminContextRecord | null>(null);

export function AdminContextProvider({
  value,
  children,
}: {
  value: AdminContextRecord;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdminContext must be used within AdminContextProvider");
  }

  return context;
}
