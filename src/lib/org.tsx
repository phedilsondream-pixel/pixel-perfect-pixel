import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "./session";

export interface Membership {
  organization_id: string;
  role: string;
  organizations: { id: string; name: string; nif: string | null; status: string; default_tax_rate: number } | null;
}

interface OrgCtx {
  memberships: Membership[];
  current: Membership | null;
  orgId: string | null;
  role: string | null;
  setOrgId: (id: string) => void;
  loading: boolean;
  can: (roles: string[]) => boolean;
}
const Ctx = createContext<OrgCtx | null>(null);
const KEY = "nexora.org";

export const FINANCE_READ = ["owner", "admin", "director", "manager", "accountant", "auditor"];
export const FINANCE_WRITE = ["owner", "admin", "accountant"];
export const SALES_WRITE = ["owner", "admin", "director", "manager", "accountant", "sales", "operator"];
export const ADMINS = ["owner", "admin"];

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ["memberships", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(id, name, nif, status, default_tax_rate)")
        .eq("user_id", uid!);
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
  const [orgId, setOrgIdState] = useState<string | null>(null);
  useEffect(() => { setOrgIdState(localStorage.getItem(KEY)); }, []);
  const memberships = q.data ?? [];
  const current = memberships.find((m) => m.organization_id === orgId) ?? memberships[0] ?? null;
  const value = useMemo<OrgCtx>(() => ({
    memberships, current, orgId: current?.organization_id ?? null, role: current?.role ?? null,
    setOrgId: (id) => { localStorage.setItem(KEY, id); setOrgIdState(id); },
    loading: q.isLoading, can: (roles) => !!current && roles.includes(current.role),
  }), [memberships, current, q.isLoading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg outside OrgProvider");
  return c;
}
