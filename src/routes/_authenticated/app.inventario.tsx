import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Plus, Search, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader, Empty, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, formatDate, formatKz } from "@/lib/format";

// The inventory migration is versioned but may not yet be applied in every environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/app/inventario")({
  head: () => ({ meta: [{ title: "Inventário e stock — Nexora" }, { name: "description", content: "Artigos, níveis de stock e movimentos auditáveis." }] }),
  component: Inventory,
});

type Item = { id: string; organization_id: string; sku: string; name: string; description: string | null; unit: string; quantity: number; minimum_quantity: number; unit_cost: number; active: boolean; updated_at: string; warehouse_id: string | null };
type Movement = { id: string; organization_id: string; product_id: string; warehouse_id: string; type: string; quantity: number; quantity_after: number | null; reference: string | null; notes: string | null; note: string | null; created_at: string };
const emptyItem = { sku: "", name: "", description: "", unit: "un", minimum_quantity: "0", unit_cost: "0" };
const movementLabels: Record<string, string> = { opening: "Stock inicial", receipt: "Entrada", issue: "Saída", adjustment: "Ajuste" };

function Inventory() {
  const { orgId, can } = useOrg();
  const readRoles = ["owner", "admin", "director", "manager", "warehouse", "warehouse_manager", "stock_manager", "sales", "sales_manager", "operator", "accountant"];
  const writeRoles = ["owner", "admin", "warehouse", "warehouse_manager", "stock_manager"];
  const allowed = readRoles.some((role) => can([role]));
  const writable = writeRoles.some((role) => can([role]));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<Item | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [movementForm, setMovementForm] = useState({ movement_type: "receipt", quantity: "", unit_cost: "0", reference: "", notes: "" });

  const itemsQuery = useQuery({
    queryKey: ["inventory-items", orgId], enabled: !!orgId && allowed,
    queryFn: async () => {
      const [{ data: warehouses, error: warehouseError }, { data, error }] = await Promise.all([
        db.from("warehouses").select("id, is_default").eq("organization_id", orgId).order("is_default", { ascending: false }),
        db.from("products").select("id, organization_id, sku, name, description, unit, cost, minimum_quantity, is_active, updated_at, stock_levels(warehouse_id, quantity, min_quantity)").eq("organization_id", orgId).order("name"),
      ]);
      if (warehouseError) throw warehouseError;
      if (error) throw error;
      const defaultWarehouse = (warehouses ?? []).find((w: { is_default: boolean }) => w.is_default) ?? warehouses?.[0] ?? null;
      return (data ?? []).map((product: any) => {
        const levels = product.stock_levels ?? [];
        const level = levels.find((entry: any) => entry.warehouse_id === defaultWarehouse?.id) ?? levels[0] ?? null;
        return { ...product, sku: product.sku ?? "", quantity: Number(level?.quantity ?? 0), minimum_quantity: Number(product.minimum_quantity ?? level?.min_quantity ?? 0), unit_cost: Number(product.cost ?? 0), active: product.is_active, warehouse_id: level?.warehouse_id ?? defaultWarehouse?.id ?? null } as Item;
      });
    },
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-movements", orgId], enabled: !!orgId && allowed,
    queryFn: async () => {
      const { data, error } = await db.from("stock_movements").select("id, organization_id, product_id, warehouse_id, type, quantity, quantity_after, reference, notes, note, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });
  const items = itemsQuery.data ?? [];
  const visible = useMemo(() => items.filter((item) =>
    item.active && (!lowOnly || Number(item.quantity) <= Number(item.minimum_quantity)) &&
    `${item.sku} ${item.name} ${item.description ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [items, search, lowOnly]);
  const stockValue = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0);
  const lowCount = items.filter((item) => item.active && Number(item.quantity) <= Number(item.minimum_quantity)).length;

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const min = Number(itemForm.minimum_quantity), cost = Number(itemForm.unit_cost);
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(cost) || cost < 0) return toast.error("O stock mínimo e o custo devem ser iguais ou superiores a zero.");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return toast.error("A sessão expirou. Inicie sessão novamente.");
    let { data: warehouse, error: warehouseError } = await db.from("warehouses").select("id").eq("organization_id", orgId).order("is_default", { ascending: false }).limit(1).maybeSingle();
    if (warehouseError) return toast.error(errMsg(warehouseError));
    if (!warehouse) {
      const createdWarehouse = await db.from("warehouses").insert({ organization_id: orgId, name: "Armazém principal", is_default: true }).select("id").single();
      if (createdWarehouse.error) return toast.error(errMsg(createdWarehouse.error));
      warehouse = createdWarehouse.data;
    }
    const { data, error } = await db.from("products").insert({
      organization_id: orgId, sku: itemForm.sku.trim(), name: itemForm.name.trim(),
      description: itemForm.description.trim() || null, unit: itemForm.unit.trim() || "un",
      price: 0, cost, minimum_quantity: min, currency: "AOA", is_active: true,
    }).select("id").single();
    if (error) return toast.error(error.code === "23505" ? "Já existe um artigo com este SKU nesta organização." : errMsg(error));
    setNewOpen(false); setItemForm(emptyItem);
    await qc.invalidateQueries({ queryKey: ["inventory-items", orgId] });
    toast.success("Artigo criado. Registe uma entrada para adicionar stock.");
    if (data?.id) {
      const created = { ...itemForm, id: data.id, organization_id: orgId, quantity: 0, active: true, unit_cost: cost, minimum_quantity: min, updated_at: new Date().toISOString(), description: itemForm.description || null, warehouse_id: warehouse.id } as Item;
      setMoveItem(created); setMovementForm({ movement_type: "opening", quantity: "", unit_cost: String(cost), reference: "", notes: "Stock inicial" }); setMovementOpen(true);
    }
  }
  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !moveItem) return;
    const qty = Number(movementForm.quantity), cost = Number(movementForm.unit_cost);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) return toast.error("Introduza uma quantidade positiva e um custo válido.");
    if (movementForm.movement_type === "adjustment") return toast.error("Para manter o histórico auditável, selecione Entrada ou Saída em vez de ajuste livre.");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return toast.error("A sessão expirou. Inicie sessão novamente.");
    let warehouseId = moveItem.warehouse_id;
    if (!warehouseId) {
      const { data: warehouse, error: warehouseError } = await db.from("warehouses").select("id").eq("organization_id", orgId).order("is_default", { ascending: false }).limit(1).maybeSingle();
      if (warehouseError) return toast.error(errMsg(warehouseError));
      if (!warehouse) return toast.error("Crie um armazém antes de registar movimentos de stock.");
      warehouseId = warehouse.id;
    }
    const { error } = await db.from("stock_movements").insert({
      organization_id: orgId, product_id: moveItem.id, warehouse_id: warehouseId,
      type: movementForm.movement_type, quantity: qty, unit_cost: cost,
      reference: movementForm.reference.trim() || null, notes: movementForm.notes.trim() || null,
      note: movementForm.notes.trim() || movementForm.reference.trim() || null, created_by: auth.user.id,
    });
    if (error) return toast.error(errMsg(error));
    toast.success(movementForm.movement_type === "issue" ? "Saída registada." : "Entrada registada.");
    setMovementOpen(false); setMoveItem(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["inventory-items", orgId] }),
      qc.invalidateQueries({ queryKey: ["inventory-movements", orgId] }),
    ]);
  }
  if (!allowed) return <NoAccess />;
  return <>
    <PageHeader title="Inventário e stock" description="Catálogo de artigos, alertas de stock mínimo e movimentos com histórico."
      actions={writable && <Button variant="copper" onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo artigo</Button>} />
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Artigos activos</p><p className="mt-2 text-2xl font-semibold">{items.filter(i => i.active).length}</p></div>
      <div className="rounded-xl border border-cyan/20 bg-card p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Valor estimado do stock</p><p className="num mt-2 text-2xl font-semibold">{formatKz(stockValue)}</p><p className="mt-1 text-xs text-muted-foreground">Quantidade × custo unitário registado</p></div>
      <button className="rounded-xl border bg-card p-5 text-left hover:border-cyan/50" onClick={() => setLowOnly(!lowOnly)}><p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><AlertTriangle className="h-4 w-4" />Abaixo do mínimo</p><p className="mt-2 text-2xl font-semibold">{lowCount}</p><p className="mt-1 text-xs text-muted-foreground">{lowOnly ? "Clique para ver todos os artigos" : "Clique para filtrar artigos críticos"}</p></button>
    </div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar por SKU, nome ou descrição" value={search} onChange={e => setSearch(e.target.value)} /></div><Button variant="outline" onClick={() => { setMovementForm({ movement_type: "receipt", quantity: "", unit_cost: "0", reference: "", notes: "" }); setMoveItem(items.find(i => i.active) ?? null); setMovementOpen(true); }} disabled={!writable || items.filter(i => i.active).length === 0}><ArrowDownToLine className="mr-2 h-4 w-4" />Registar movimento</Button></div>
    {itemsQuery.isLoading ? <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">A carregar inventário…</div>
      : itemsQuery.isError ? <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível carregar o inventário. Confirme as permissões da empresa e a ligação ao armazém.</div>
      : visible.length === 0 ? <Empty title="Sem artigos" hint="Crie o catálogo da empresa e registe as entradas e saídas de stock." action={writable && <Button variant="outline" onClick={() => setNewOpen(true)}>Criar primeiro artigo</Button>} />
      : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Artigo</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Mínimo</th><th className="px-4 py-3 text-right">Custo unitário</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acções</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.sku} · {item.unit}</p></td><td className="num px-4 py-3">{Number(item.quantity).toLocaleString("pt-PT")} {item.unit}</td><td className="num px-4 py-3">{Number(item.minimum_quantity).toLocaleString("pt-PT")} {item.unit}</td><td className="num px-4 py-3 text-right">{formatKz(item.unit_cost)}</td><td className="px-4 py-3">{Number(item.quantity) <= Number(item.minimum_quantity) ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 px-2 py-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" />Stock baixo</span> : <span className="text-xs text-emerald-600">Disponível</span>}</td><td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!writable} onClick={() => { setMoveItem(item); setMovementForm({ movement_type: "receipt", quantity: "", unit_cost: String(item.unit_cost), reference: "", notes: "" }); setMovementOpen(true); }}><ArrowDownToLine className="mr-1 h-3 w-3" />Entrada</Button><Button size="sm" variant="outline" disabled={!writable || Number(item.quantity) <= 0} onClick={() => { setMoveItem(item); setMovementForm({ movement_type: "issue", quantity: "", unit_cost: String(item.unit_cost), reference: "", notes: "" }); setMovementOpen(true); }}><ArrowUpFromLine className="mr-1 h-3 w-3" />Saída</Button></div></td></tr>)}</tbody></table></div>}
    <div className="mt-8"><h2 className="mb-3 font-semibold">Movimentos recentes</h2>{movementsQuery.isError ? <p className="text-sm text-muted-foreground">Histórico indisponível. Verifique as permissões de inventário.</p> : (movementsQuery.data ?? []).length === 0 ? <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Ainda não existem movimentos de stock.</p> : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Artigo</th><th className="px-4 py-3">Movimento</th><th className="px-4 py-3">Quantidade</th><th className="px-4 py-3">Stock após</th><th className="px-4 py-3">Referência</th></tr></thead><tbody>{(movementsQuery.data ?? []).map(m => <tr key={m.id} className="border-t"><td className="px-4 py-3">{formatDate(m.created_at)}</td><td className="px-4 py-3">{items.find(i => i.id === m.product_id)?.name ?? "Artigo"}</td><td className="px-4 py-3">{movementLabels[m.type] ?? m.type}</td><td className="num px-4 py-3">{["issue","out","outbound","saida","saída","stock_out","sale","venda","consumo"].includes(m.type.toLowerCase()) ? "-" : "+"}{m.quantity}</td><td className="num px-4 py-3">{m.quantity_after ?? "—"}</td><td className="px-4 py-3">{m.reference ?? m.note ?? "—"}</td></tr>)}</tbody></table></div>}</div>
    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><DialogTitle>Novo artigo de inventário</DialogTitle></DialogHeader><form onSubmit={createItem} className="space-y-4"><div className="space-y-1"><Label>SKU / código interno</Label><Input required maxLength={80} value={itemForm.sku} onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} /></div><div className="space-y-1"><Label>Nome do artigo</Label><Input required minLength={2} maxLength={180} value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div><div className="space-y-1"><Label>Descrição</Label><textarea maxLength={4000} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Unidade</Label><Input required maxLength={24} value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} /></div><div className="space-y-1"><Label>Stock mínimo</Label><Input type="number" min="0" step="0.001" value={itemForm.minimum_quantity} onChange={e => setItemForm({ ...itemForm, minimum_quantity: e.target.value })} /></div></div><div className="space-y-1"><Label>Custo unitário (Kz)</Label><Input type="number" min="0" step="0.01" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: e.target.value })} /></div><Button type="submit" className="w-full"><Package className="mr-2 h-4 w-4" />Criar artigo</Button></form></DialogContent></Dialog>
    <Dialog open={movementOpen} onOpenChange={setMovementOpen}><DialogContent><DialogHeader><DialogTitle>Registar movimento de stock</DialogTitle></DialogHeader>{!moveItem ? <p className="text-sm text-muted-foreground">Crie primeiro um artigo de inventário.</p> : <form onSubmit={saveMovement} className="space-y-4"><div className="rounded-lg border bg-muted/30 p-3"><p className="font-medium">{moveItem.name}</p><p className="text-xs text-muted-foreground">{moveItem.sku} · stock actual: {Number(moveItem.quantity)} {moveItem.unit}</p></div><div className="space-y-1"><Label>Tipo de movimento</Label><Select value={movementForm.movement_type} onValueChange={v => setMovementForm({ ...movementForm, movement_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="opening">Stock inicial</SelectItem><SelectItem value="receipt">Entrada</SelectItem><SelectItem value="issue">Saída</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Quantidade</Label><Input type="number" required min="0.001" step="0.001" value={movementForm.quantity} onChange={e => setMovementForm({ ...movementForm, quantity: e.target.value })} /></div><div className="space-y-1"><Label>Custo unitário (Kz)</Label><Input type="number" min="0" step="0.01" value={movementForm.unit_cost} onChange={e => setMovementForm({ ...movementForm, unit_cost: e.target.value })} /></div><div className="space-y-1"><Label>Referência (opcional)</Label><Input maxLength={180} placeholder="Factura, guia, ordem…" value={movementForm.reference} onChange={e => setMovementForm({ ...movementForm, reference: e.target.value })} /></div><div className="space-y-1"><Label>Notas</Label><textarea maxLength={4000} className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={movementForm.notes} onChange={e => setMovementForm({ ...movementForm, notes: e.target.value })} /></div><Button type="submit" className="w-full">Confirmar movimento</Button></form>}</DialogContent></Dialog>
  </>;
}
