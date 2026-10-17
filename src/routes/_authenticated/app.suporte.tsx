import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Headphones, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader, Empty, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, formatDate } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/app/suporte")({
  head: () => ({ meta: [{ title: "Atendimento e suporte — Nexora" }, { name: "description", content: "Tickets de suporte da organização." }] }),
  component: SupportDesk,
});

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";
type Ticket = { id: string; ticket_number: number; subject: string; description: string; status: TicketStatus; priority: Priority; customer_id: string | null; created_at: string; updated_at: string };
type Customer = { id: string; name: string };
const statuses: { value: TicketStatus; label: string }[] = [{ value: "open", label: "Aberto" }, { value: "in_progress", label: "Em tratamento" }, { value: "waiting_customer", label: "A aguardar cliente" }, { value: "resolved", label: "Resolvido" }, { value: "closed", label: "Fechado" }];
const priorities: { value: Priority; label: string }[] = [{ value: "low", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "high", label: "Alta" }, { value: "urgent", label: "Urgente" }];

function SupportDesk() {
  const { orgId, can } = useOrg();
  const writable = can(["owner", "admin", "director", "manager", "supervisor", "operator", "sales", "support"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", customer_id: "none", priority: "normal" as Priority });
  const allowed = ["owner", "admin", "director", "manager", "supervisor", "operator", "employee", "sales", "support", "auditor"].some((role) => can([role]));
  const tickets = useQuery({
    queryKey: ["support-tickets", orgId],
    enabled: !!orgId && allowed,
    queryFn: async () => {
      const { data, error } = await db.from("support_tickets").select("*").eq("organization_id", orgId).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });
  const customers = useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
  const list = useMemo(() => (tickets.data ?? []).filter((t) =>
    (statusFilter === "all" || t.status === statusFilter) &&
    `#${t.ticket_number} ${t.subject} ${t.description}`.toLowerCase().includes(search.toLowerCase())
  ), [tickets.data, statusFilter, search]);
  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form.subject.trim() || !form.description.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return toast.error("A sessão expirou. Inicie sessão novamente.");
    const { error } = await db.from("support_tickets").insert({
      organization_id: orgId, subject: form.subject.trim(), description: form.description.trim(),
      customer_id: form.customer_id === "none" ? null : form.customer_id, priority: form.priority, created_by: auth.user.id,
    });
    if (error) return toast.error(errMsg(error));
    toast.success("Pedido de suporte registado.");
    setOpen(false); setForm({ subject: "", description: "", customer_id: "none", priority: "normal" });
    await qc.invalidateQueries({ queryKey: ["support-tickets", orgId] });
  }
  async function updateTicket(ticket: Ticket, patch: Partial<Pick<Ticket, "status" | "priority">>) {
    if (!orgId || !writable) return;
    const { error } = await db.from("support_tickets").update({ ...patch, ...(patch.status === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", ticket.id).eq("organization_id", orgId);
    if (error) return toast.error(errMsg(error));
    toast.success("Ticket atualizado.");
    await qc.invalidateQueries({ queryKey: ["support-tickets", orgId] });
  }
  if (!allowed) return <NoAccess />;
  const openCount = (tickets.data ?? []).filter((t) => ["open", "in_progress", "waiting_customer"].includes(t.status)).length;
  return <>
    <PageHeader title="Atendimento e suporte" description="Centralize pedidos, prioridades e resolução de ocorrências."
      actions={writable && <Button variant="copper" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo ticket</Button>} />
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-card p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Tickets registados</p><p className="mt-2 text-2xl font-semibold">{tickets.data?.length ?? 0}</p></div><div className="rounded-xl border border-cyan/20 bg-card p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Em aberto</p><p className="mt-2 text-2xl font-semibold">{openCount}</p></div></div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar tickets" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os estados</SelectItem>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
    {tickets.isLoading ? <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">A carregar tickets…</div> : tickets.isError ? <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível carregar os tickets. Confirme se a migração de suporte foi aplicada à base de dados.</div> : list.length === 0 ? <Empty title="Sem tickets" hint="Registe pedidos de clientes ou ocorrências internas para acompanhar o tratamento." action={writable && <Button variant="outline" onClick={() => setOpen(true)}>Criar primeiro ticket</Button>} /> :
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Criado</th></tr></thead><tbody>{list.map((t) => <tr key={t.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">#{t.ticket_number} · {t.subject}</p><p className="mt-1 max-w-lg truncate text-xs text-muted-foreground">{t.description}</p></td><td className="px-4 py-3">{customers.data?.find((c) => c.id === t.customer_id)?.name ?? "—"}</td><td className="px-4 py-3">{writable ? <Select value={t.priority} onValueChange={(v) => updateTicket(t, { priority: v as Priority })}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{priorities.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select> : priorities.find((p) => p.value === t.priority)?.label}</td><td className="px-4 py-3">{writable ? <Select value={t.status} onValueChange={(v) => updateTicket(t, { status: v as TicketStatus })}><SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select> : statuses.find((s) => s.value === t.status)?.label}</td><td className="px-4 py-3">{formatDate(t.created_at)}</td></tr>)}</tbody></table></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Novo ticket de suporte</DialogTitle></DialogHeader><form onSubmit={createTicket} className="space-y-4"><div className="space-y-1"><Label>Assunto</Label><Input required minLength={3} maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div><div className="space-y-1"><Label>Descrição</Label><textarea required minLength={1} maxLength={10000} className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="space-y-1"><Label>Cliente (opcional)</Label><Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem cliente associado</SelectItem>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Prioridade</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorities.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div><Button type="submit" className="w-full"><Headphones className="mr-2 h-4 w-4" />Registar ticket</Button></form></DialogContent></Dialog>
  </>;
}
