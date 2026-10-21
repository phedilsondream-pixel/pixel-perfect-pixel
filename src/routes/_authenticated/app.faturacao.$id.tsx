import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, SALES_WRITE, FINANCE_WRITE } from "@/lib/org";
import { Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKz, formatDate, errMsg, DOC_TYPES, INVOICE_STATUS, lineTotals } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/faturacao/$id")({
  head: () => ({ meta: [{ title: "Documento — Nexora" }, { name: "description", content: "Detalhe do documento comercial." }, { property: "og:title", content: "Documento — Nexora" }, { property: "og:description", content: "Detalhe do documento comercial." }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const { orgId, current, can } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
      ]);
      if (inv.error) throw inv.error;
      if (items.error) throw items.error;
      const customerResult = inv.data?.customer_id
        ? await supabase.from("customers").select("id,name,nif,tax_id,address").eq("id", inv.data.customer_id).eq("organization_id", inv.data.organization_id).maybeSingle()
        : { data: null, error: null };
      if (customerResult.error) throw customerResult.error;
      return { inv: inv.data ? { ...inv.data, customers: customerResult.data } : null, items: items.data ?? [] };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["invoice", id] }); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const [line, setLine] = useState({ description: "", quantity: "1", unit_price: "", tax_rate: String(current?.organizations?.default_tax_rate ?? 14) });

  if (q.isLoading) return <p className="text-muted-foreground">A carregar…</p>;
  const inv = q.data?.inv;
  if (!inv) return <Empty title="Documento não encontrado" hint="Pode ter sido apagado ou não tem acesso." />;
  const items = q.data!.items;
  const draft = inv.status === "draft";
  const cust = inv.customers as { name: string; nif: string | null; tax_id: string | null; address: string | null } | null;
  const preview = lineTotals(Number(line.quantity) || 0, Number(line.unit_price) || 0, Number(line.tax_rate) || 0);

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(line.quantity), unit_price = Number(line.unit_price), tax_rate = Number(line.tax_rate);
    if (!(quantity > 0) || !(unit_price >= 0) || !(tax_rate >= 0 && tax_rate <= 100)) return toast.error("Valores inválidos.");
    const { error } = await supabase.from("invoice_items").insert({ invoice_id: id, organization_id: orgId!, description: line.description.trim(), quantity, unit_price, tax_rate, sort_order: items.length });
    if (error) return toast.error(errMsg(error));
    setLine({ ...line, description: "", unit_price: "", quantity: "1" });
    refresh();
  }
  async function removeLine(lineId: string) {
    const { error } = await supabase.from("invoice_items").delete().eq("id", lineId);
    if (error) return toast.error(errMsg(error));
    refresh();
  }
  async function issue() {
    const { data, error } = await supabase.rpc("issue_invoice", { _invoice: id });
    if (error) return toast.error(errMsg(error));
    toast.success(`Documento emitido: ${data}`);
    refresh();
  }
  async function removeDraft() {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Rascunho apagado.");
    refresh(); navigate({ to: "/app/faturacao", search: { novo: undefined } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <Link to="/app/faturacao" search={{ novo: undefined }} className="text-sm text-muted-foreground hover:text-foreground">← Faturação</Link>
        <div className="flex flex-wrap gap-2">
          {draft && can(SALES_WRITE) && <>
            <Button variant="ghost" onClick={removeDraft}>Apagar rascunho</Button>
            <Button variant="copper" onClick={issue} disabled={items.length === 0 || inv.doc_type !== "PF"}>Emitir pró-forma interna</Button>
          </>}
          {draft && inv.doc_type !== "PF" && <p className="max-w-md text-xs text-amber-600">A emissão fiscal de FT/FR/NC está bloqueada até a Nexora concluir a integração e autorização da AGT. Pode guardar o documento como rascunho; não será apresentado como fatura fiscal emitida.</p>}
          {inv.status === "issued" && can(FINANCE_WRITE) && <>
            {Number(inv.amount_paid) === 0 && <CancelDialog id={id} onDone={refresh} />}
            <PayDialog id={id} due={Number(inv.total) - Number(inv.amount_paid)} onDone={refresh} />
          </>}
          {!draft && <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-soft md:p-10">
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{DOC_TYPES[inv.doc_type]}</div>
            <h1 className="num mt-1 text-2xl">{inv.number ?? "Rascunho"}</h1>
            <div className="mt-1 text-sm text-muted-foreground">{INVOICE_STATUS[inv.status]}{inv.cancel_reason ? ` — ${inv.cancel_reason}` : ""}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{current?.organizations?.name}</div>
            {current?.organizations?.nif && <div className="text-muted-foreground">NIF {current.organizations.nif}</div>}
          </div>
        </div>
        <div className="mt-8 grid gap-6 text-sm sm:grid-cols-3">
          <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</div><div className="mt-1 font-medium">{cust?.name}</div>{(cust?.nif ?? cust?.tax_id) && <div className="text-muted-foreground">NIF {cust?.nif ?? cust?.tax_id}</div>}{cust?.address && <div className="text-muted-foreground">{cust.address}</div>}</div>
          <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Data</div><div className="mt-1">{formatDate(inv.issue_date)}</div></div>
          <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Vencimento</div><div className="mt-1">{formatDate(inv.due_date)}</div></div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-2">Descrição</th><th className="py-2 text-right">Qtd.</th><th className="py-2 text-right">Preço</th><th className="py-2 text-right">IVA</th><th className="py-2 text-right">Total</th>{draft && <th />}</tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2">{it.description}</td>
                  <td className="num py-2 text-right">{Number(it.quantity)}</td>
                  <td className="num py-2 text-right">{formatKz(it.unit_price)}</td>
                  <td className="num py-2 text-right">{Number(it.tax_rate)}%</td>
                  <td className="num py-2 text-right">{formatKz(Number(it.line_subtotal) + Number(it.line_tax))}</td>
                  {draft && <td className="py-2 text-right print:hidden"><Button size="sm" variant="ghost" onClick={() => removeLine(it.id)}>Remover</Button></td>}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem linhas. Adicione produtos ou serviços abaixo.</td></tr>}
            </tbody>
          </table>
        </div>

        {draft && can(SALES_WRITE) && (
          <form onSubmit={addLine} className="mt-4 grid gap-2 rounded-md bg-muted p-3 sm:grid-cols-[1fr_80px_130px_80px_auto] print:hidden">
            <Input required maxLength={200} placeholder="Descrição" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
            <Input required type="number" step="0.001" min="0.001" aria-label="Quantidade" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} />
            <Input required type="number" step="0.01" min="0" placeholder="Preço (Kz)" value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: e.target.value })} />
            <Input required type="number" step="0.01" min="0" max="100" aria-label="IVA %" value={line.tax_rate} onChange={(e) => setLine({ ...line, tax_rate: e.target.value })} />
            <Button type="submit">Adicionar · {formatKz(preview.total)}</Button>
          </form>
        )}

        <div className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
          <Row k="Subtotal" v={formatKz(inv.subtotal)} />
          <Row k="IVA" v={formatKz(inv.tax_total)} />
          <div className="border-t pt-2"><Row k="Total" v={formatKz(inv.total)} strong /></div>
          {Number(inv.amount_paid) > 0 && <><Row k="Pago" v={formatKz(inv.amount_paid)} /><Row k="Em dívida" v={formatKz(Number(inv.total) - Number(inv.amount_paid))} /></>}
        </div>
        <p className="mt-8 text-xs text-muted-foreground">Documento gerado na Nexora. A conformidade com os requisitos fiscais da AGT deve ser validada por um profissional antes do uso oficial.</p>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}><span className="text-muted-foreground">{k}</span><span className="num">{v}</span></div>;
}

function PayDialog({ id, due, onDone }: { id: string; due: number; onDone: () => void }) {
  const { orgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(due));
  const [account, setAccount] = useState("");
  const [ref, setRef] = useState("");
  const accounts = useQuery({ queryKey: ["accounts", orgId], enabled: open, queryFn: async () => (await supabase.from("bank_accounts").select("id, name").eq("organization_id", orgId!)).data ?? [] });
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return toast.error("Escolha a conta de destino.");
    const { error } = await supabase.rpc("register_invoice_payment", { _invoice: id, _account: account, _amount: Number(amount), _reference: ref || undefined });
    if (error) return toast.error(errMsg(error));
    toast.success("Pagamento registado na tesouraria.");
    setOpen(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="copper">Registar pagamento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registar pagamento</DialogTitle></DialogHeader>
        <form onSubmit={pay} className="space-y-3">
          <div className="space-y-1"><Label>Valor (em dívida {formatKz(due)})</Label><Input type="number" step="0.01" min="0.01" max={due} required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1"><Label>Conta</Label>
            <Select value={account} onValueChange={setAccount}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Referência (opcional, evita duplicados)</Label><Input maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <Button type="submit" className="w-full">Confirmar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  async function cancel(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("cancel_invoice", { _invoice: id, _reason: reason });
    if (error) return toast.error(errMsg(error));
    toast.success("Documento anulado.");
    setOpen(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Anular</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular documento</DialogTitle></DialogHeader>
        <form onSubmit={cancel} className="space-y-3">
          <div className="space-y-1"><Label>Motivo</Label><Textarea required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Button type="submit" variant="destructive" className="w-full">Anular</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
