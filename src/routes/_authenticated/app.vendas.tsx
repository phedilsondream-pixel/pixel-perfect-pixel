import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, SALES_WRITE } from "@/lib/org";
import { PageHeader, Empty, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKz, formatDate, errMsg } from "@/lib/format";

// Until the Supabase migration is applied and generated types are refreshed, keep
// the ungenerated tables isolated behind this narrow, temporary query boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/app/vendas")({
  head: () => ({ meta: [{ title: "Pipeline comercial — Nexora" }, { name: "description", content: "Gestão de oportunidades comerciais por organização." }] }),
  component: SalesPipeline,
});

type Stage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
type Opportunity = { id: string; title: string; stage: Stage; amount: number; currency: string; customer_id: string | null; expected_close_date: string | null; notes: string | null; created_at: string; updated_at: string };
type Customer = { id: string; name: string };
const STAGES: { value: Stage; label: string }[] = [
  { value: "lead", label: "Lead" }, { value: "qualified", label: "Qualificado" },
  { value: "proposal", label: "Proposta" }, { value: "negotiation", label: "Negociação" },
  { value: "won", label: "Ganho" }, { value: "lost", label: "Perdido" },
];
const emptyForm = { title: "", customer_id: "none", amount: "0", expected_close_date: "", notes: "" };

function SalesPipeline() {
  const { orgId, can } = useOrg();
  const writable = can(SALES_WRITE);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const opportunities = useQuery({
    queryKey: ["sales-opportunities", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from("sales_opportunities").select("*").eq("organization_id", orgId).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Opportunity[];
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

  const list = useMemo(() => (opportunities.data ?? []).filter((o) =>
    (stageFilter === "all" || o.stage === stageFilter) &&
    `${o.title} ${customers.data?.find((c) => c.id === o.customer_id)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [opportunities.data, customers.data, stageFilter, search]);
  const totalOpen = (opportunities.data ?? []).filter((o) => !["won", "lost"].includes(o.stage)).reduce((sum, o) => sum + Number(o.amount), 0);
  const won = (opportunities.data ?? []).filter((o) => o.stage === "won").reduce((sum, o) => sum + Number(o.amount), 0);

  function startNew() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function startEdit(o: Opportunity) {
    setEditing(o);
    setForm({ title: o.title, customer_id: o.customer_id ?? "none", amount: String(o.amount), expected_close_date: o.expected_close_date ?? "", notes: o.notes ?? "" });
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form.title.trim()) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) return toast.error("O valor deve ser igual ou superior a zero.");
    const row = { title: form.title.trim(), customer_id: form.customer_id === "none" ? null : form.customer_id, amount, currency: "AOA", expected_close_date: form.expected_close_date || null, notes: form.notes.trim() || null };
    const result = editing
      ? await db.from("sales_opportunities").update(row).eq("id", editing.id).eq("organization_id", orgId)
      : await db.from("sales_opportunities").insert({ ...row, organization_id: orgId });
    if (result.error) return toast.error(errMsg(result.error));
    toast.success(editing ? "Oportunidade atualizada." : "Oportunidade criada.");
    setOpen(false);
    await qc.invalidateQueries({ queryKey: ["sales-opportunities", orgId] });
  }
  async function changeStage(o: Opportunity, stage: Stage) {
    if (!orgId || !writable) return;
    const { error } = await db.from("sales_opportunities").update({ stage }).eq("id", o.id).eq("organization_id", orgId);
    if (error) return toast.error(errMsg(error));
    toast.success("Etapa comercial atualizada.");
    await qc.invalidateQueries({ queryKey: ["sales-opportunities", orgId] });
  }

  if (!can(["owner", "admin", "director", "manager", "supervisor", "sales", "accountant", "auditor"])) return <NoAccess />;
  return (
    <>
      <PageHeader title="Pipeline comercial" description="Acompanhe oportunidades, previsões e evolução das vendas."
        actions={writable && <Button onClick={startNew} variant="copper"><Plus className="mr-2 h-4 w-4" />Nova oportunidade</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-cyan/20 bg-card p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Pipeline em aberto</p><p className="num mt-2 text-2xl font-semibold">{formatKz(totalOpen)}</p><p className="mt-1 text-xs text-muted-foreground">Soma das oportunidades não concluídas</p></div>
        <div className="rounded-xl border border-cyan/20 bg-card p-5"><p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><TrendingUp className="h-4 w-4 text-cyan" />Vendas ganhas</p><p className="num mt-2 text-2xl font-semibold">{formatKz(won)}</p><p className="mt-1 text-xs text-muted-foreground">Valor registado na etapa Ganho</p></div>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar oportunidade ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="sm:w-52"><SelectValue placeholder="Todas as etapas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
      </div>
      {opportunities.isLoading ? <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">A carregar oportunidades…</div>
        : opportunities.isError ? <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível carregar o pipeline. Verifique se a migração comercial foi aplicada e tente novamente.</div>
        : list.length === 0 ? <Empty title="Sem oportunidades" hint="Registe uma oportunidade comercial para acompanhar o valor potencial e a evolução até ao fecho." action={writable && <Button onClick={startNew} variant="outline">Criar primeira oportunidade</Button>} />
        : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Oportunidade</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Fecho previsto</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Ações</th></tr></thead><tbody>{list.map((o) => <tr key={o.id} className="border-t"><td className="px-4 py-3"><button className="text-left font-medium hover:text-cyan" onClick={() => startEdit(o)}>{o.title}</button><p className="mt-1 text-xs text-muted-foreground">Actualizado {formatDate(o.updated_at)}</p></td><td className="px-4 py-3">{customers.data?.find((c) => c.id === o.customer_id)?.name ?? "Sem cliente associado"}</td><td className="num px-4 py-3 text-right">{formatKz(o.amount)}</td><td className="px-4 py-3">{formatDate(o.expected_close_date)}</td><td className="px-4 py-3">{writable ? <Select value={o.stage} onValueChange={(v) => changeStage(o, v as Stage)}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select> : STAGES.find((s) => s.value === o.stage)?.label}</td><td className="px-4 py-3">{writable && <Button size="sm" variant="outline" onClick={() => startEdit(o)}>Editar</Button>}</td></tr>)}</tbody></table></div>}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4"><div className="space-y-1"><Label>Nome da oportunidade</Label><Input required minLength={2} maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div className="space-y-1"><Label>Cliente (opcional)</Label><Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem cliente associado</SelectItem>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Valor previsto (Kz)</Label><Input required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div><div className="space-y-1"><Label>Data prevista de fecho</Label><Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} /></div><div className="space-y-1"><Label>Notas</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={5000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div><Button type="submit" className="w-full">{editing ? "Guardar alterações" : "Criar oportunidade"}</Button></form></DialogContent></Dialog>
    </>
  );
}
