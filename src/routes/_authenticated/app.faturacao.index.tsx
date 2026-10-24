import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, SALES_WRITE } from "@/lib/org";
import { PageHeader, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKz, formatDate, errMsg, INVOICE_STATUS, DOC_TYPES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/faturacao/")({
  validateSearch: (s: Record<string, unknown>) => ({ novo: s["novo"] === true || s["novo"] === "true" ? true : undefined }),
  head: () => ({ meta: [{ title: "Faturação — Nexora" }, { name: "description", content: "Faturas e documentos comerciais." }, { property: "og:title", content: "Faturação — Nexora" }, { property: "og:description", content: "Faturas e documentos comerciais." }] }),
  component: Invoices,
});

function Invoices() {
  const { orgId, can } = useOrg();
  const { novo } = Route.useSearch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("all");
  useEffect(() => { if (novo) setOpen(true); }, [novo]);
  const q = useQuery({
    queryKey: ["invoices", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id, organization_id, customer_id, number, doc_type, status, issue_date, due_date, total, amount_paid, created_at").eq("organization_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      const customerIds = [...new Set((data ?? []).map((invoice) => invoice.customer_id).filter(Boolean))];
      const { data: customers, error: customersError } = customerIds.length
        ? await supabase.from("customers").select("id,name").in("id", customerIds)
        : { data: [], error: null };
      if (customersError) throw customersError;
      return (data ?? []).map((invoice) => ({ ...invoice, customers: customers?.find((customer) => customer.id === invoice.customer_id) ?? null }));
    },
  });
  const list = (q.data ?? []).filter((i) => status === "all" || i.status === status);
  return (
    <>
      <PageHeader title="Faturação" description="Faturas, faturas-recibo, pró-formas e notas de crédito."
        actions={can(SALES_WRITE) && <Button variant="copper" onClick={() => setOpen(true)}>Novo documento</Button>} />
      <div className="mb-4 w-48">
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(INVOICE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>
      {q.data && q.data.length === 0 ? (
        <Empty title="Sem documentos" hint="Pode emitir pró-formas internas. Faturas fiscais FT/FR e notas de crédito ficam bloqueadas até concluir a autorização e integração com a AGT." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Número</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="cursor-pointer border-t hover:bg-muted" onClick={() => navigate({ to: "/app/faturacao/$id", params: { id: i.id } })}>
                  <td className="num px-4 py-2"><Link to="/app/faturacao/$id" params={{ id: i.id }}>{i.number ?? `${i.doc_type} · rascunho`}</Link></td>
                  <td className="px-4 py-2">{(i.customers as { name: string } | null)?.name}</td>
                  <td className="px-4 py-2">{formatDate(i.issue_date)}</td>
                  <td className="px-4 py-2"><StatusBadge status={i.status} /></td>
                  <td className="num px-4 py-2 text-right">{formatKz(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewInvoiceDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && novo) navigate({ to: "/app/faturacao", search: { novo: undefined } }); }} />
    </>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status === "paid" ? "bg-success/15 text-success" : status === "issued" ? "bg-accent text-accent-foreground" : status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{INVOICE_STATUS[status]}</span>;
}

function NewInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState("");
  const [docType, setDocType] = useState("PF");
  const customers = useQuery({
    queryKey: ["customers", orgId], enabled: !!orgId && open,
    queryFn: async () => (await supabase.from("customers").select("*").eq("organization_id", orgId!).order("name")).data ?? [],
  });
  async function create() {
    if (!customer) return toast.error("Escolha um cliente.");
    const { data: u } = await supabase.auth.getUser();
    const due = new Date(); due.setDate(due.getDate() + 30);
    const { data, error } = await supabase.from("invoices").insert({ organization_id: orgId!, customer_id: customer, doc_type: docType as "FT", due_date: due.toISOString().slice(0, 10), created_by: u.user!.id }).select("id").single();
    if (error) return toast.error(errMsg(error));
    onOpenChange(false);
    navigate({ to: "/app/faturacao/$id", params: { id: data.id } });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo documento</DialogTitle></DialogHeader>
        {customers.data && customers.data.length === 0 ? (
          <Empty title="Precisa de um cliente" hint="Registe primeiro o cliente." action={<Button asChild variant="outline"><Link to="/app/clientes">Ir para clientes</Link></Button>} />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={docType} onValueChange={setDocType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Cliente</Label>
              <Select value={customer} onValueChange={setCustomer}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <Button className="w-full" onClick={create}>Criar rascunho</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
