import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutDashboard, Wallet, FileText, Users, UserCog, CreditCard, ScrollText, Grid3x3, Shield, LogOut, Menu, Sparkles, ChevronRight, TrendingUp, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, FINANCE_READ } from "@/lib/org";
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
  { to: "/app/vendas", label: "Pipeline comercial", icon: TrendingUp, roles: ["owner", "admin", "director", "manager", "supervisor", "sales", "accountant", "auditor"] },
  { to: "/app/suporte", label: "Atendimento e suporte", icon: Headphones, roles: ["owner", "admin", "director", "manager", "supervisor", "operator", "employee", "sales", "support", "auditor"] },
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
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${active ? "bg-gradient-to-r from-blue-600/90 to-sky-500/80 text-white shadow-lg shadow-blue-950/20" : "text-sidebar-foreground/80 hover:bg-white/[0.06] hover:text-white"}`}>
            <n.icon className="h-4 w-4 shrink-0" /><span className="flex-1">{n.label}</span>{active && <ChevronRight className="h-3.5 w-3.5 opacity-80" />}
          </Link>
        );
      })}
      {admin.data && (
        <Link to="/admin" onClick={() => setOpen(false)} className={`mt-4 flex items-center gap-3 rounded-lg border border-cyan/20 px-3 py-2.5 text-sm ${path.startsWith("/admin") ? "bg-cyan/15 text-white" : "bg-white/[0.03] text-cyan hover:bg-cyan/10"}`}>
          <Shield className="h-4 w-4" />Administração Nexora
        </Link>
      )}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="relative overflow-hidden border-b border-sidebar-border px-5 py-6">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan/10 blur-2xl" />
        <div className="relative"><Logo /></div>
        <div className="relative mt-5 flex items-center gap-2 rounded-lg border border-sidebar-border bg-white/[0.04] px-3 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-gradient text-white"><Sparkles className="h-3.5 w-3.5" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">Business Suite</p><p className="truncate text-xs text-sidebar-foreground/70">Inteligência para gerir melhor</p></div>
        </div>
      </div>
      {memberships.length > 0 && (
        <div className="px-3">
          <Select value={current?.organization_id} onValueChange={(v) => { setOrgId(v); navigate({ to: "/app" }); }}>
            <SelectTrigger className="border-sidebar-border bg-sidebar-border text-sidebar-accent-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {memberships.map((m) => <SelectItem key={m.organization_id} value={m.organization_id}>{m.organizations?.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t border-sidebar-border bg-black/10 p-4 text-xs">
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
        <header className="nexora-topbar sticky top-0 z-30 flex items-center gap-3 px-4 py-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menu" className="text-cyan hover:bg-cyan/10"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-64 border-0 p-0">{sidebar}</SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1"><Logo /><p className="mt-1 truncate text-[10px] text-muted-foreground">{current?.organizations?.name ?? "Espaço de gestão"}</p></div>
          <span className="rounded-full border border-cyan/25 bg-cyan/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan">Suite</span>
        </header>
        <header className="nexora-topbar sticky top-0 z-30 hidden h-[66px] items-center justify-between gap-4 px-6 lg:flex">
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-8 w-px bg-cyan/30" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{current?.organizations?.name ?? "Nexora Business Suite"}</p><p className="text-[10px] uppercase tracking-[0.2em] text-cyan">Espaço de trabalho empresarial</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-lg border border-cyan/20 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 xl:block"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(18,200,255,.8)]" />Ambiente seguro · Dados da organização</div>
            <div className="rounded-lg border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan">Nexora Suite</div>
          </div>
        </header>
        {current?.organizations?.status === "suspended" && (
          <div className="bg-destructive px-4 py-2 text-sm text-destructive-foreground">Esta organização está suspensa. Os dados estão em modo de leitura.</div>
        )}
        <main className="nexora-workspace nexora-page-grid mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 lg:p-8">
          <div className="nexora-brand-ribbon relative mb-6 flex items-center justify-between gap-4 overflow-hidden rounded-xl px-5 py-4 md:px-6">
            <div className="relative z-10 flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan/30 bg-blue-500/15 text-cyan shadow-[0_0_22px_rgba(0,153,255,.14)]"><Sparkles className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan">Nexora Business Suite</p>
                <p className="mt-1 text-sm font-semibold text-white md:text-base">Gestão integrada. Decisões inteligentes. Crescimento sustentável.</p>
                <p className="nexora-ribbon-detail mt-1 text-xs text-blue-100/75">Finanças · Pessoas · Operações · Clientes · Controlo empresarial</p>
              </div>
            </div>
            <div className="nexora-ribbon-detail relative z-10 hidden shrink-0 text-right sm:block"><p className="text-[9px] uppercase tracking-[0.2em] text-blue-200">Tecnologia para empresas</p><p className="mt-1 text-xs font-semibold text-cyan">Um só espaço. Mais controlo.</p></div>
          </div>
          {children}
        </main>
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
