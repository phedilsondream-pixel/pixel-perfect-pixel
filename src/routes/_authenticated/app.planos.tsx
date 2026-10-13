import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/AppShell";
import { formatKz, formatDate, SUB_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/planos")({
  head: () => ({ meta: [{ title: "Plano e assinatura — Nexora" }, { name: "description", content: "Compare planos e veja a sua assinatura." }, { property: "og:title", content: "Planos — Nexora" }, { property: "og:description", content: "Planos Start, Business e Enterprise." }] }),
  component: Plans,
});

function Plans() {
  const { orgId } = useOrg();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const q = useQuery({
    queryKey: ["plans", orgId], enabled: !!orgId,
    queryFn: async () => {
      const [plans, sub, pays] = await Promise.all([
        supabase.from("plans").select("*").eq("active", true).order("sort_order"),
        supabase.from("subscriptions").select("*").eq("organization_id", orgId!).maybeSingle(),
        supabase.from("subscription_payments").select("*").eq("organization_id", orgId!).order("paid_at", { ascending: false }),
      ]);
      return { plans: plans.data ?? [], sub: sub.data, pays: pays.data ?? [] };
    },
  });
  const d = q.data;
  return (
    <>
      <PageHeader title="Plano e assinatura" description={d?.sub ? `Estado: ${SUB_STATUS[d.sub.status]} · Renovação/fim do período: ${formatDate(d.sub.current_period_end)}` : undefined} />
      <div className="mb-6 inline-flex rounded-md border bg-card p-1 text-sm">
        {(["monthly", "yearly"] as const).map((c) => (
          <button key={c} onClick={() => setCycle(c)} className={`rounded px-4 py-1.5 ${cycle === c ? "bg-primary text-primary-foreground" : ""}`}>{c === "monthly" ? "Mensal" : "Anual"}</button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {d?.plans.map((p) => {
          const mine = d.sub?.plan_id === p.id;
          return (
            <div key={p.id} className={`relative rounded-lg border bg-card p-6 shadow-soft ${p.is_featured ? "border-copper ring-1 ring-copper" : ""}`}>
              {p.is_featured && <span className="absolute -top-3 left-6 rounded bg-copper px-2 py-0.5 text-xs text-copper-foreground">Recomendado</span>}
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              <div className="num mt-4 text-2xl">{formatKz(cycle === "monthly" ? p.price_monthly : p.price_yearly)}<span className="text-sm text-muted-foreground">/{cycle === "monthly" ? "mês" : "ano"}</span></div>
              <ul className="mt-4 space-y-1 text-sm">
                <li>Até {p.max_users} utilizadores</li>
                <li>{p.max_branches} filial(is)</li>
                <li>{p.storage_gb} GB de armazenamento</li>
                <li>{p.max_documents_month.toLocaleString("pt-AO")} documentos/mês</li>
                {p.features.map((f) => <li key={f} className="text-muted-foreground">{f}</li>)}
              </ul>
              <div className="mt-6 text-sm">{mine ? <span className="font-medium text-copper">Plano atual</span> : <span className="text-muted-foreground">Para mudar de plano, contacte a equipa Nexora.</span>}</div>
            </div>
          );
        })}
      </div>
      <h2 className="mb-3 mt-10 text-lg font-semibold">Histórico de pagamentos</h2>
      <div className="rounded-lg border bg-card p-4 text-sm">
        {d?.pays.length ? d.pays.map((p) => (
          <div key={p.id} className="flex justify-between border-b py-2 last:border-0"><span>{formatDate(p.paid_at)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span><span className="num">{formatKz(p.amount)}</span></div>
        )) : <p className="text-muted-foreground">Sem pagamentos registados. O pagamento online ainda não está configurado; os pagamentos são registados manualmente pela equipa Nexora.</p>}
      </div>
    </>
  );
}
