import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Empty, usePlatformAdmin } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKz, formatDate, errMsg, SUB_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração Nexora" }, { name: "description", content: "Gestão de clientes SaaS e planos." }, { property: "og:title", content: "Administração Nexora" }, { property: "og:description", content: "Gestão de clientes SaaS e planos." }] }),
  component: Admin,
});

function Admin() {
  const admin = usePlatformAdmin();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin"], enabled: admin.data === true,
    queryFn: async () => {
      const [orgs, subs, plans] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*"),
        supabase.from("plans").select("*").order("sort_order"),
      ]);
      return { orgs: orgs.data ?? [], subs: subs.data ?? [], plans: plans.data ?? [] };
    },
  });
  if (admin.isLoading) return null;
  if (!admin.data) return <Empty title="Área reservada" hint="Apenas a equipa Nexora tem acesso." />;
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  async function toggle(org: { id: string; status: string }) {
    const reason = org.status === "active" ? window.prompt("Motivo da suspensão:") : "";
    if (org.status === "active" && !reason) return;
    const { error } = await supabase.rpc("admin_set_org_status", { _org: org.id, _status: org.status === "active" ? "suspended" : "active", _reason: reason ?? "" });
    if (error) return toast.error(errMsg(error));
    toast.success("Estado atualizado."); refresh();
  }
  async function setSub(id: string, patch: { status?: string; plan_id?: string }) {
    const { error } = await supabase.from("subscriptions").update(patch as never).eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Assinatura atualizada."); refresh();
  }
  async function recordPayment(sub: { id: string; organization_id: string }) {
    const amount = Number(window.prompt("Valor recebido (Kz):"));
    if (!(amount > 0)) return;
    const reference = window.prompt("Referência do pagamento:") || null;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("subscription_payments").insert({ organization_id: sub.organization_id, subscription_id: sub.id, amount, reference, method: "manual", recorded_by: u.user!.id });
    if (error) return toast.error(errMsg(error));
    toast.success("Pagamento manual registado."); refresh();
  }

  return (
    <>
      <PageHeader title="Administração Nexora" description={`${d?.orgs.length ?? 0} organizações`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Empresa</th><th className="px-4 py-2">Plano</th><th className="px-4 py-2">Assinatura</th><th className="px-4 py-2">Criada</th><th /></tr></thead>
          <tbody>
            {d?.orgs.map((o) => {
              const s = d.subs.find((x) => x.organization_id === o.id);
              return (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-2"><div className="font-medium">{o.name}</div>{o.status === "suspended" && <div className="text-xs text-destructive">Suspensa: {o.suspended_reason}</div>}</td>
                  <td className="px-4 py-2">{s && <Select value={s.plan_id} onValueChange={(v) => setSub(s.id, { plan_id: v })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{d.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>}</td>
                  <td className="px-4 py-2">{s && <Select value={s.status} onValueChange={(v) => setSub(s.id, { status: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SUB_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(o.created_at)}</td>
                  <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                    {s && <Button size="sm" variant="outline" onClick={() => recordPayment(s)}>Pagamento</Button>}
                    <Button size="sm" variant="ghost" onClick={() => toggle(o)}>{o.status === "active" ? "Suspender" : "Reativar"}</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 mt-10 text-lg font-semibold">Planos (preços e limites editáveis)</h2>
      <div className="grid gap-4 lg:grid-cols-3">{d?.plans.map((p) => <PlanEditor key={p.id} plan={p} onSaved={refresh} />)}</div>
    </>
  );
}

type Plan = { id: string; name: string; price_monthly: number; price_yearly: number; max_users: number; max_documents_month: number; trial_days: number };
function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [f, setF] = useState({ price_monthly: String(plan.price_monthly), price_yearly: String(plan.price_yearly), max_users: String(plan.max_users), max_documents_month: String(plan.max_documents_month), trial_days: String(plan.trial_days) });
  async function save() {
    const patch = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]));
    if (Object.values(patch).some((v) => !(v >= 0))) return toast.error("Valores inválidos.");
    const { error } = await supabase.from("plans").update(patch).eq("id", plan.id);
    if (error) return toast.error(errMsg(error));
    toast.success(`Plano ${plan.name} atualizado.`); onSaved();
  }
  const fields: [keyof typeof f, string][] = [["price_monthly", "Mensal (Kz)"], ["price_yearly", "Anual (Kz)"], ["max_users", "Máx. utilizadores"], ["max_documents_month", "Documentos/mês"], ["trial_days", "Dias de teste"]];
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <div className="font-medium">{plan.name} <span className="num text-xs text-muted-foreground">{formatKz(plan.price_monthly)}</span></div>
      {fields.map(([k, label]) => (
        <label key={k} className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{label}</span><Input className="w-32" type="number" min="0" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
      ))}
      <Button size="sm" className="w-full" onClick={save}>Guardar</Button>
    </div>
  );
}
