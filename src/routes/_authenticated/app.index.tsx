import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, FINANCE_READ } from "@/lib/org";
import { PageHeader, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatKz, formatDate, INVOICE_STATUS, SUB_STATUS } from "@/lib/format";

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

  return (
    <>
      <PageHeader title={current?.organizations?.name ?? "Painel"} description={sub ? `Plano ${sub.plans?.name} · ${SUB_STATUS[sub.status]}${sub.status === "trial" ? ` até ${formatDate(sub.trial_ends_at)}` : ""}` : undefined}
        actions={<Button asChild variant="copper"><Link to="/app/faturacao" search={{ novo: true }}>Novo documento</Link></Button>} />
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
    <div className="rounded-lg border bg-card p-5 shadow-soft">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-2 text-xl font-medium">{value}</div>
      {hint && <div className="mt-1 text-xs text-destructive">{hint}</div>}
    </div>
  );
}
