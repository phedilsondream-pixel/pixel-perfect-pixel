import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutDashboard, Wallet, FileText, Users, UserCog, CreditCard, ScrollText, Grid3x3, Shield, LogOut, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, FINANCE_READ, ADMINS } from "@/lib/org";
import { useSession } from "@/lib/session";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, errMsg } from "@/lib/format";

const NAV = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, roles: null },
  { to: "/app/financas", label: "Finanças", icon: Wallet, roles: FINANCE_READ },
  { to: "/app/faturacao", label: "Faturação", icon: FileText, roles: null },
  { to: "/app/clientes", label: "Clientes", icon: Users, roles: null },
  { to: "/app/equipa", label: "Equipa", icon: UserCog, roles: null },
  { to: "/app/planos", label: "Plano e assinatura", icon: CreditCard, roles: null },
  { to: "/app/auditoria", label: "Auditoria", icon: ScrollText, roles: ["owner", "admin", "director", "auditor", "accountant"] },
  { to: "/app/modulos", label: "Todos os módulos", icon: Grid3x3, roles: null },
] as const;

export function usePlatformAdmin() {
  const { session } = useSession();
  return useQuery({
    queryKey: ["platform-admin", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", session!.user.id).maybeSingle();
      return !!data;
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { memberships, current, loading, setOrgId, can } = useOrg();
  const { session } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const admin = usePlatformAdmin();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">A carregar…</div>;
  if (!current && !path.startsWith("/admin")) return <Onboarding />;

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.filter((n) => !n.roles || can([...n.roles])).map((n) => {
        const active = n.to === "/app" ? path === "/app" : path.startsWith(n.to);
        return (
          <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
            <n.icon className={`h-4 w-4 ${active ? "text-sidebar-primary" : ""}`} />{n.label}
          </Link>
        );
      })}
      {admin.data && (
        <Link to="/admin" onClick={() => setOpen(false)} className={`mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${path.startsWith("/admin") ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
          <Shield className="h-4 w-4" />Administração Nexora
        </Link>
      )}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5"><Logo /></div>
      {memberships.length > 0 && (
        <div className="px-3">
          <Select value={current?.organization_id} onValueChange={(v) => { setOrgId(v); navigate({ to: "/app" }); }}>
            <SelectTrigger className="border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {memberships.map((m) => <SelectItem key={m.organization_id} value={m.organization_id}>{m.organizations?.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t border-sidebar-border p-4 text-xs">
        <div className="truncate text-sidebar-accent-foreground">{session?.user.email}</div>
        {current && <div className="mt-0.5 text-sidebar-foreground/60">{ROLE_LABELS[current.role]}</div>}
        <button onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))} className="mt-3 flex items-center gap-2 hover:text-sidebar-accent-foreground">
          <LogOut className="h-3.5 w-3.5" />Terminar sessão
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 md:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Menu"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 border-0 p-0">{sidebar}</SheetContent>
          </Sheet>
          <span className="font-display font-semibold">{current?.organizations?.name ?? "Nexora"}</span>
        </header>
        {current?.organizations?.status === "suspended" && (
          <div className="bg-destructive px-4 py-2 text-sm text-destructive-foreground">Esta organização está suspensa. Os dados estão em modo de leitura.</div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function Onboarding() {
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { setOrgId } = useOrg();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", { _name: name, _nif: nif, _plan_code: "business" });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setOrgId(data as string);
    await qc.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Empresa criada. Teste do plano Business ativo.");
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-lg border bg-card p-8 shadow-soft">
        <Logo tone="light" />
        <div>
          <h1 className="text-2xl font-semibold">Registe a sua empresa</h1>
          <p className="mt-1 text-sm text-muted-foreground">Começa com 14 dias de teste do plano Business.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="org">Nome da empresa</Label><Input id="org" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="nif">NIF (opcional)</Label><Input id="nif" maxLength={20} value={nif} onChange={(e) => setNif(e.target.value)} /></div>
        <Button type="submit" variant="copper" className="w-full" disabled={busy}>{busy ? "A criar…" : "Criar empresa"}</Button>
      </form>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoAccess() {
  return <Empty title="Sem acesso" hint="A sua função nesta empresa não permite ver esta área. Fale com um administrador." />;
}
