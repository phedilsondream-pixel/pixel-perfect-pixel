import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, FINANCE_READ, FINANCE_WRITE } from "@/lib/org";
import { PageHeader, Empty, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKz, formatDate, errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/financas")({
  head: () => ({ meta: [{ title: "Finanças e tesouraria — Nexora" }, { name: "description", content: "Contas, caixa e movimentos." }, { property: "og:title", content: "Finanças — Nexora" }, { property: "og:description", content: "Contas, caixa e movimentos." }] }),
  component: Finance,
});

function Finance() {
  const { orgId, can } = useOrg();
  const write = can(FINANCE_WRITE);
  const q = useQuery({
    queryKey: ["finance", orgId],
    enabled: !!orgId && can(FINANCE_READ),
    queryFn: async () => {
      const [acc, bal, tx] = await Promise.all([
        supabase.from("bank_accounts").select("*").eq("organization_id", orgId!).order("created_at"),
        supabase.rpc("account_balances", { _org: orgId! }),
        supabase.from("transactions").select("*").eq("organization_id", orgId!).order("tx_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
      ]);
      if (acc.error) throw acc.error;
      const balances = new Map((bal.data ?? []).map((b) => [b.account_id, Number(b.balance)]));
      return { accounts: acc.data ?? [], balances, tx: tx.data ?? [] };
    },
  });
  if (!can(FINANCE_READ)) return <NoAccess />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Finanças e tesouraria" description="Saldos calculados a partir dos movimentos registados."
        actions={write && d ? <><AccountDialog /><TxDialog accounts={d.accounts} /></> : null} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {d?.accounts.map((a) => (
          <div key={a.id} className="rounded-lg border bg-card p-5 shadow-soft">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{a.type === "cash" ? "Caixa" : a.bank_name || "Banco"}</div>
            <div className="mt-1 font-medium">{a.name}</div>
            <div className="num mt-3 text-xl">{formatKz(d.balances.get(a.id) ?? a.opening_balance)}</div>
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Movimentos</h2>
      {d && d.tx.length === 0 ? (
        <Empty title="Sem movimentos" hint="Registe entradas e saídas, ou receba pagamentos de faturas." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2">Categoria</th><th className="px-4 py-2">Conta</th><th className="px-4 py-2 text-right">Valor</th></tr>
            </thead>
            <tbody>
              {d?.tx.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2">{formatDate(t.tx_date)}</td>
                  <td className="px-4 py-2">{t.description || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.category}</td>
                  <td className="px-4 py-2 text-muted-foreground">{d.accounts.find((a) => a.id === t.account_id)?.name ?? "Conta"}</td>
                  <td className={`num px-4 py-2 text-right ${t.kind === "income" ? "text-success" : "text-destructive"}`}>{t.kind === "income" ? "+" : "−"}{formatKz(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Os movimentos não podem ser apagados para preservar o histórico. Corrija com um movimento inverso.</p>
    </>
  );
}

function AccountDialog() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", type: "bank", bank_name: "", iban: "", opening_balance: "0" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("bank_accounts").insert({ organization_id: orgId!, name: f.name.trim(), type: f.type as "bank" | "cash", bank_name: f.bank_name || null, iban: f.iban || null, opening_balance: Number(f.opening_balance) || 0 });
    if (error) return toast.error(errMsg(error));
    toast.success("Conta criada.");
    setOpen(false); qc.invalidateQueries({ queryKey: ["finance"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Nova conta</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1"><Label>Nome</Label><Input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Tipo</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="bank">Conta bancária</SelectItem><SelectItem value="cash">Caixa</SelectItem></SelectContent></Select></div>
          {f.type === "bank" && <>
            <div className="space-y-1"><Label>Banco</Label><Input maxLength={80} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>IBAN</Label><Input maxLength={40} value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} /></div>
          </>}
          <div className="space-y-1"><Label>Saldo inicial (Kz)</Label><Input type="number" step="0.01" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} /></div>
          <Button type="submit" className="w-full">Guardar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TxDialog({ accounts }: { accounts: { id: string; name: string }[] }) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "expense", account_id: accounts[0]?.id ?? "", amount: "", category: "", description: "", tx_date: new Date().toISOString().slice(0, 10) });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!(amount > 0)) return toast.error("Indique um valor positivo.");
    if (!f.account_id) return toast.error("Escolha uma conta.");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("transactions").insert({ organization_id: orgId!, account_id: f.account_id, kind: f.kind as "income" | "expense", amount, category: f.category.trim() || "Geral", description: f.description || null, tx_date: f.tx_date, created_by: u.user!.id });
    if (error) return toast.error(errMsg(error));
    toast.success("Movimento registado.");
    setOpen(false); qc.invalidateQueries({ queryKey: ["finance"] }); qc.invalidateQueries({ queryKey: ["dashboard"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="copper">Novo movimento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo movimento</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="income">Entrada</SelectItem><SelectItem value="expense">Saída</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Conta</Label>
              <Select value={f.account_id} onValueChange={(v) => setF({ ...f, account_id: v })}><SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Valor (Kz)</Label><Input required type="number" step="0.01" min="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label>Data</Label><Input type="date" required value={f.tx_date} onChange={(e) => setF({ ...f, tx_date: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Categoria</Label><Input maxLength={60} placeholder="Ex.: Renda, Salários, Vendas" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <div className="space-y-1"><Label>Descrição</Label><Input maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <Button type="submit" className="w-full">Registar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
