import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/AppShell";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Platform = { code: string; name: string; description: string; sort_order: number };
type Subscription = { plan_id: string; status: string; current_period_end: string | null; trial_ends_at: string | null; created_at: string };

const routeByPlatform: Record<string, string> = {
  finance: "/app/financas",
  invoicing: "/app/faturacao",
  inventory: "/app/inventario",
  crm: "/app/vendas",
  support: "/app/suporte",
  hr: "/app/departamentos",
  projects: "/app/departamentos",
  operations: "/app/departamentos",
  production: "/app/departamentos",
  education: "/app/departamentos",
  restaurant: "/app/departamentos",
  pos: "/app/departamentos",
  legal: "/app/departamentos",
};

export const Route = createFileRoute("/_authenticated/app/modulos")({
  head: () => ({
    meta: [
      { title: "Plataformas — Nexora" },
      { name: "description", content: "Plataformas departamentais e direitos incluídos na assinatura Nexora." },
    ],
  }),
  component: Modules,
});

function Modules() {
  const { orgId } = useOrg();
  const q = useQuery({
    queryKey: ["department-platform-catalog", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [subResult, catalogResult, organizationResult] = await Promise.all([
        db.from("subscriptions").select("plan_id,status,current_period_end,trial_ends_at,created_at").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("department_platforms").select("code,name,description,sort_order").eq("is_active", true).order("sort_order"),
        db.from("organizations").select("trial_ends_at,status").eq("id", orgId!).maybeSingle(),
      ]);
      if (subResult.error) throw subResult.error;
      if (catalogResult.error) throw catalogResult.error;
      if (organizationResult.error) throw organizationResult.error;
      const sub = subResult.data as Subscription | null;
      const organization = organizationResult.data as { trial_ends_at: string | null; status: string } | null;
      const now = Date.now();
      const trialEndsAt = sub?.trial_ends_at ?? organization?.trial_ends_at;
      const subscriptionActive = !!sub
        && ["active", "trial"].includes(sub.status)
        && (!sub.current_period_end || new Date(sub.current_period_end).getTime() >= now)
        && (sub.status !== "trial" || !trialEndsAt || new Date(trialEndsAt).getTime() >= now)
        && !["cancelled", "canceled", "suspended", "deleted", "inactive"].includes(String(organization?.status ?? "").toLowerCase());
      if (!sub || !subscriptionActive) return { platforms: (catalogResult.data ?? []) as Platform[], enabled: [] as string[], subscriptionActive: false };
      const { data: entitlementRows, error: entitlementError } = await db.from("plan_platforms").select("platform_code").eq("plan_id", sub.plan_id).eq("enabled", true);
      if (entitlementError) throw entitlementError;
      return {
        platforms: (catalogResult.data ?? []) as Platform[],
        enabled: (entitlementRows ?? []).map((row: { platform_code: string }) => row.platform_code) as string[],
        subscriptionActive: true,
      };
    },
  });

  return (
    <>
      <PageHeader
        title="Plataformas Nexora"
        description="As plataformas disponíveis são determinadas pelo plano e pela assinatura da organização. A proteção de dados também é aplicada na base de dados."
      />
      {q.isLoading ? <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">A consultar os direitos da assinatura…</div>
        : q.isError ? <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível consultar as plataformas. Tente novamente.</div>
        : <>
          {!q.data?.subscriptionActive && <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">A organização não tem uma assinatura ativa. As plataformas operacionais ficam bloqueadas até existir um plano válido.</div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {q.data?.platforms.map((platform, index) => {
              const included = q.data.enabled.includes(platform.code);
              const to = routeByPlatform[platform.code];
              const card = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="num text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${included ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {included ? <CheckCircle2 className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                      {included ? "Incluída no plano" : "Não incluída"}
                    </span>
                  </div>
                  <h2 className="mt-3 font-semibold">{platform.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.description}</p>
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Código da plataforma: {platform.code}</p>
                  {included && to && <div className="mt-3 text-sm font-medium text-cyan">Abrir plataforma <span aria-hidden="true">→</span></div>}
                </>
              );
              return included && to
                ? <Link key={platform.code} to={to as never} className="rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-cyan">{card}</Link>
                : <article key={platform.code} className="rounded-xl border border-dashed bg-card/60 p-5">{card}</article>;
            })}
          </div>
        </>}
      <p className="mt-6 text-xs text-muted-foreground">A presença no catálogo não substitui a implementação operacional de cada processo. Algumas áreas ainda têm fluxos parciais.</p>
    </>
  );
}
