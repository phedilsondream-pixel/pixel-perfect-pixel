import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, FINANCE_READ } from "@/lib/org";
import { PageHeader, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatKz, formatDate, INVOICE_STATUS, SUB_STATUS } from "@/lib/format";
import { ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Painel — Nexora" }, { name: "description", content: "Indicadores da sua empresa." }, { property: "og:title", content: "Painel — Nexora" }, { property: "og:description", content: "Indicadores da sua empresa." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { orgId, current, can } = useOrg();
  const finance = can(FINANCE_READ);
  const q = useQuery({
    queryKey: ["dashboard", orgId, finance],
    enabled: !!orgId,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1);
      const ms = monthStart.toISOString().slice(0, 10);
      const [inv, sub, bal, tx] = await Promise.all([
        supabase.from("invoices").select("id, number, status, total, amount_paid, due_date, issue_date, customers(name)").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(50),
        supabase.from("subscriptions").select("status, trial_ends_at, plans(name)").eq("organization_id", orgId!).maybeSingle(),
        finance ? supabase.rpc("account_balances", { _org: orgId! }) : Promise.resolve({ data: [] as { balance: number }[] }),
        finance ? supabase.from("transactions").select("kind, amount").eq("organization_id", orgId!).gte("tx_date", ms) : Promise.resolve({ data: [] as { kind: string; amount: number }[] }),
      ]);
      return { invoices: inv.data ?? [], sub: sub.data, balances: bal.data ?? [], tx: tx.data ?? [] };
    },
  });
  const d = q.data;
  const today = new Date().toISOString().slice(0, 10);
  const open = d?.invoices.filter((i) => i.status === "issued") ?? [];
  const receivable = open.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);
  const overdue = open.filter((i) => i.due_date && i.due_date < today);
  const cash = d?.balances.reduce((s, b) => s + Number(b.balance), 0) ?? 0;
  const income = d?.tx.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const expense = d?.tx.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
  const sub = d?.sub as { status: string; trial_ends_at: string | null; plans: { name: string } | null } | null | undefined;

  if (!orgId) return <CreateOrganization />;

  return (
    <>
      <PageHeader title={current?.organizations?.name ?? "Painel"} description={sub ? `Plano ${sub.plans?.name} · ${SUB_STATUS[sub.status]}${sub.status === "trial" ? ` até ${formatDate(sub.trial_ends_at)}` : ""}` : undefined}
        actions={<Button asChild variant="copper"><Link to="/app/faturacao" search={{ novo: true }}>Novo documento</Link></Button>} />
      <section className="nexora-hero relative mb-7 overflow-hidden rounded-2xl p-6 text-white shadow-xl md:p-8">
        <div className="nexora-hero-orb nexora-hero-orb-one" />
        <div className="nexora-hero-orb nexora-hero-orb-two" />
        <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100">
              <Sparkles className="h-3.5 w-3.5" /> Nexora Executive Workspace
            </div>
            <h2 className="max-w-xl text-2xl font-bold leading-tight text-white md:text-3xl">Clareza para decidir. Controlo para crescer.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/85">Acompanhe a saúde financeira e a operação da sua empresa num espaço de gestão integrado, seguro e preparado para crescer consigo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="border border-white/15 bg-white text-slate-900 hover:bg-sky-50"><Link to="/app/financas"><ShieldCheck className="mr-2 h-4 w-4" />Ver finanças <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/app/modulos">Explorar plataformas</Link></Button>
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {finance && <Kpi label="Saldo em contas" value={formatKz(cash)} />}
        {finance && <Kpi label="Entradas do mês" value={formatKz(income)} />}
        {finance && <Kpi label="Saídas do mês" value={formatKz(expense)} />}
        <Kpi label="A receber" value={formatKz(receivable)} hint={overdue.length ? `${overdue.length} vencido(s)` : undefined} />
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Últimos documentos</h2>
        {q.isLoading ? <p className="text-sm text-muted-foreground">A carregar…</p> : d && d.invoices.length === 0 ? (
          <Empty title="Ainda não há documentos" hint="Registe um cliente e emita a primeira fatura para ver indicadores aqui." action={<Button asChild variant="outline"><Link to="/app/clientes">Adicionar cliente</Link></Button>} />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {d?.invoices.slice(0, 8).map((i) => (
              <Link key={i.id} to="/app/faturacao/$id" params={{ id: i.id }} className="flex items-center justify-between gap-4 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted">
                <div><div className="font-medium">{i.number ?? "Rascunho"}</div><div className="text-muted-foreground">{(i.customers as { name: string } | null)?.name}</div></div>
                <div className="text-right"><div className="num">{formatKz(i.total)}</div><div className="text-xs text-muted-foreground">{INVOICE_STATUS[i.status]}</div></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-soft before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-gradient-to-b before:from-blue-600 before:to-cyan">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-2 text-xl font-medium">{value}</div>
      {hint && <div className="mt-1 text-xs text-destructive">{hint}</div>}
    </div>
  );
}


function CreateOrganization() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Introduza o nome da empresa.");
    if (logo && (!["image/png", "image/jpeg", "image/webp"].includes(logo.type) || logo.size > 2 * 1024 * 1024)) {
      return toast.error("O logótipo deve ser PNG, JPG ou WebP e ter no máximo 2 MB.");
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_my_organization", {
        p_name: name.trim(),
        p_nif: nif.trim() || null,
      });
      if (error) throw error;
      const orgId = data as string;
      if (logo) {
        const ext = logo.type === "image/png" ? "png" : logo.type === "image/webp" ? "webp" : "jpg";
        const path = orgId + "/logo." + ext;
        const { error: uploadError } = await supabase.storage.from("organization-logos").upload(path, logo, { upsert: true, contentType: logo.type });
        if (uploadError) throw uploadError;
        const { error: logoError } = await supabase.from("organizations").update({ logo_url: path }).eq("id", orgId);
        if (logoError) throw logoError;
      }
      await qc.invalidateQueries({ queryKey: ["memberships"] });
      await qc.invalidateQueries();
      toast.success("Empresa criada com sucesso.");
      window.location.assign("/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível criar a empresa.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <PageHeader title="Criar a sua empresa" description="Configure o espaço da sua organização para começar a usar a Nexora Business Suite." />
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-lg md:p-7">
        <div className="space-y-2">
          <Label htmlFor="company-name">Nome da empresa *</Label>
          <Input id="company-name" required minLength={2} maxLength={160} autoComplete="organization" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Empresa Comercial, Lda." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company-nif">NIF</Label>
          <Input id="company-nif" maxLength={40} value={nif} onChange={e => setNif(e.target.value)} placeholder="Número de Identificação Fiscal" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company-logo">Logótipo (opcional)</Label>
          <Input id="company-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setLogo(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WebP; máximo 2 MB. Pode adicionar o logótipo mais tarde.</p>
        </div>
        <Button type="submit" variant="copper" className="w-full" disabled={busy}>{busy ? "A criar empresa…" : "Criar empresa e continuar"}</Button>
      </form>
    </div>
  );
}
