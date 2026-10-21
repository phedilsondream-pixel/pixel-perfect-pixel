import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/AppShell";
import { formatKz, formatDate, SUB_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/planos")({
  head: () => ({ meta: [{ title: "Plano e assinatura — Nexora" }, { name: "description", content: "Compare planos e consulte a assinatura da sua organização." }] }),
  component: Plans,
});

// The production schema stores plan entitlements in plan_platforms and JSONB features.modules.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_users: number | null;
  max_branches: number | null;
  max_storage_mb: number | null;
  is_active: boolean;
  sort_order: number;
};
type Platform = { code: string; name: string };
type PlanPlatform = { plan_id: string; platform_code: string; enabled: boolean };
type Subscription = {
  id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
};

function Plans() {
  const { orgId } = useOrg();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const q = useQuery({
    queryKey: ["plans", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [plansResult, subscriptionResult, platformsResult, entitlementsResult] = await Promise.all([
        db.from("plans").select("id,code,name,description,price_monthly,price_yearly,currency,max_users,max_branches,max_storage_mb,is_active,sort_order").eq("is_active", true).order("sort_order"),
        db.from("subscriptions").select("id,plan_id,status,billing_cycle,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,created_at").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("department_platforms").select("code,name").eq("is_active", true).order("sort_order"),
        db.from("plan_platforms").select("plan_id,platform_code,enabled").eq("enabled", true),
      ]);
      if (plansResult.error) throw plansResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (platformsResult.error) throw platformsResult.error;
      if (entitlementsResult.error) throw entitlementsResult.error;
      return {
        plans: (plansResult.data ?? []) as Plan[],
        sub: subscriptionResult.data as Subscription | null,
        platforms: (platformsResult.data ?? []) as Platform[],
        entitlements: (entitlementsResult.data ?? []) as PlanPlatform[],
      };
    },
  });
  const d = q.data;
  const currentPlan = d?.plans.find((p) => p.id === d.sub?.plan_id);
  return (
    <>
      <PageHeader
        title="Plano e assinatura"
        description={d?.sub
          ? `Estado: ${SUB_STATUS[d.sub.status] ?? d.sub.status} · ${d.sub.cancel_at_period_end ? "Cancelamento no fim do período" : `Fim do período: ${formatDate(d.sub.current_period_end)}`}`
          : "Consulte os planos e as plataformas incluídas na sua assinatura."}
      />
      {q.isLoading ? <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">A carregar planos e direitos de acesso…</div>
        : q.isError ? <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível carregar os planos e a assinatura. Tente novamente.</div>
        : <>
          {d?.sub && <div className="mb-5 rounded-xl border border-cyan/20 bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Plano atual</p>
            <p className="mt-1 text-lg font-semibold">{currentPlan?.name ?? "Plano não encontrado"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Ciclo: {d.sub.billing_cycle === "yearly" ? "anual" : "mensal"}{d.sub.trial_ends_at ? ` · Fim do período experimental: ${formatDate(d.sub.trial_ends_at)}` : ""}</p>
          </div>}
          <div className="mb-6 inline-flex rounded-md border bg-card p-1 text-sm">
            {(["monthly", "yearly"] as const).map((c) => (
              <button key={c} onClick={() => setCycle(c)} className={`rounded px-4 py-1.5 ${cycle === c ? "bg-primary text-primary-foreground" : ""}`}>{c === "monthly" ? "Mensal" : "Anual"}</button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {d?.plans.map((p) => {
              const mine = d.sub?.plan_id === p.id;
              const enabledPlatforms = d.platforms.filter((platform) => d.entitlements.some((e) => e.plan_id === p.id && e.platform_code === platform.code && e.enabled));
              const price = Number(cycle === "monthly" ? p.price_monthly : p.price_yearly);
              const storageGb = p.max_storage_mb == null ? null : Math.round((p.max_storage_mb / 1024) * 10) / 10;
              return (
                <article key={p.id} className={`relative rounded-xl border bg-card p-6 shadow-soft ${mine ? "border-cyan ring-1 ring-cyan/30" : ""}`}>
                  {mine && <span className="absolute -top-3 left-6 rounded bg-cyan px-2 py-0.5 text-xs font-semibold text-slate-950">Plano atual</span>}
                  <h2 className="text-xl font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="num mt-4 text-2xl">{formatKz(price)}<span className="text-sm text-muted-foreground">/{cycle === "monthly" ? "mês" : "ano"}</span></div>
                  <ul className="mt-4 space-y-1 text-sm">
                    <li>{p.max_users == null ? "Utilizadores ilimitados" : `Até ${p.max_users} utilizadores`}</li>
                    <li>{p.max_branches == null ? "Filiais sem limite definido" : `${p.max_branches} filial(is)`}</li>
                    <li>{storageGb == null ? "Armazenamento sem limite definido" : `${storageGb} GB de armazenamento`}</li>
                  </ul>
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Plataformas incluídas ({enabledPlatforms.length})</p>
                    {enabledPlatforms.length
                      ? <ul className="mt-2 space-y-1">{enabledPlatforms.map((platform) => <li key={platform.code} className="flex gap-2 text-sm"><span className="text-cyan" aria-hidden="true">✓</span><span>{platform.name}</span></li>)}</ul>
                      : <p className="mt-2 text-sm text-muted-foreground">Sem plataformas atribuídas.</p>}
                  </div>
                  <div className="mt-6 text-sm">{mine ? <span className="font-medium text-cyan">Este é o plano associado à organização.</span> : <span className="text-muted-foreground">Para mudar de plano, contacte a equipa Nexora.</span>}</div>
                </article>
              );
            })}
          </div>
          <h2 className="mb-3 mt-10 text-lg font-semibold">Histórico de pagamentos</h2>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="text-muted-foreground">O registo de pagamentos ainda não está ligado a um fluxo de cobrança nesta versão. Não são apresentados pagamentos fictícios.</p>
          </div>
        </>}
    </>
  );
}
