import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BriefcaseBusiness, GraduationCap, Hotel, Factory, Scale, Users, Wrench, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMsg, formatDate, formatKz } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/departamentos")({
  head: () => ({ meta: [{ title: "Plataformas departamentais — Nexora" }, { name: "description", content: "Registos operacionais por departamento da organização." }] }),
  component: Departments,
});

// The tables are introduced by migration 0008_department_platforms.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const platformEntitlementCode: Record<string, string> = { hr_employees: "hr", business_projects: "projects", operations_work_orders: "operations", production_orders: "production", education_students: "education", hospitality_orders: "restaurant", legal_documents: "legal" };
const platformReadRoles: Record<string, string[]> = {
 hr_employees: ["owner","admin","director","manager","hr","hr_manager","hr_staff","employee"],
 business_projects: ["owner","admin","director","manager","project_manager","employee","accountant","auditor","sales","support","operator","supervisor","teacher"],
 operations_work_orders: ["owner","admin","director","manager","operations","operations_manager","supervisor","operator"],
 production_orders: ["owner","admin","director","manager","production","production_manager","operator"],
 education_students: ["owner","admin","director","education_admin","registrar","teacher"],
 hospitality_orders: ["owner","admin","director","manager","restaurant_manager","restaurant","pos","cashier","operator"],
 legal_documents: ["owner","admin","director","legal_manager","lawyer","contract_manager"]
};
const platformWriteRoles: Record<string, string[]> = {
 hr_employees: ["owner","admin","director","hr","hr_manager"],
 business_projects: ["owner","admin","director","manager","project_manager"],
 operations_work_orders: ["owner","admin","director","manager","operations","operations_manager","supervisor","operator"],
 production_orders: ["owner","admin","director","manager","production","production_manager","operator"],
 education_students: ["owner","admin","director","education_admin","registrar","teacher"],
 hospitality_orders: ["owner","admin","director","manager","restaurant_manager","restaurant","pos","cashier","operator"],
 legal_documents: ["owner","admin","director","legal_manager","lawyer","contract_manager"]
};
const platforms = [
 { id:"hr_employees", title:"Recursos Humanos", table:"hr_employees", icon:Users, name:"full_name", code:"employee_number", status:"employment_status", statuses:["active","leave","suspended","terminated"], fields:[["employee_number","N.º funcionário"],["full_name","Nome completo"],["work_email","Email profissional"],["phone","Telefone"],["department","Departamento"],["job_title","Cargo"],["hire_date","Data de admissão"]] },
 { id:"business_projects", title:"Projetos", table:"business_projects", icon:BriefcaseBusiness, name:"name", code:"code", status:"status", statuses:["planned","active","on_hold","completed","cancelled"], fields:[["code","Código"],["name","Nome do projeto"],["description","Descrição"],["start_date","Data de início"],["due_date","Prazo"],["budget","Orçamento"]] },
 { id:"operations_work_orders", title:"Operações", table:"operations_work_orders", icon:Wrench, name:"title", code:"reference", status:"status", statuses:["open","scheduled","in_progress","blocked","completed","cancelled"], fields:[["reference","Referência"],["title","Título"],["work_type","Tipo de trabalho"],["priority","Prioridade"],["scheduled_at","Agendado para"],["notes","Notas"]] },
 { id:"production_orders", title:"Produção", table:"production_orders", icon:Factory, name:"product_name", code:"order_number", status:"status", statuses:["planned","released","in_progress","quality_check","completed","cancelled"], fields:[["order_number","N.º ordem"],["product_name","Produto"],["quantity_planned","Quantidade planeada"],["planned_start","Início previsto"],["planned_end","Fim previsto"],["notes","Notas"]] },
 { id:"education_students", title:"Educação", table:"education_students", icon:GraduationCap, name:"full_name", code:"student_number", status:"status", statuses:["active","inactive","graduated","transferred"], fields:[["student_number","N.º aluno"],["full_name","Nome completo"],["guardian_name","Encarregado"],["guardian_phone","Telefone do encarregado"],["class_name","Turma"],["academic_year","Ano letivo"]] },
 { id:"hospitality_orders", title:"Hotelaria e POS", table:"hospitality_orders", icon:Hotel, name:"order_number", code:"order_number", status:"status", statuses:["open","confirmed","preparing","ready","served","paid","cancelled"], fields:[["order_number","N.º pedido"],["order_type","Tipo (pos/restaurant/takeaway)"],["table_reference","Mesa"],["notes","Notas"]] },
 { id:"legal_documents", title:"Jurídico", table:"legal_documents", icon:Scale, name:"title", code:"reference", status:"status", statuses:["draft","review","approved","signed","expired","archived"], fields:[["reference","Referência"],["title","Título"],["document_type","Tipo de documento"],["counterparty","Contraparte"],["effective_date","Data de início"],["expiry_date","Data de validade"],["notes","Notas"]] },
] as const;

type HospitalityItem = { id: string; product_id: string | null; description: string; quantity: number; unit_price: number; tax_rate: number; line_subtotal: number; line_tax: number; sort_order: number };
type HospitalityProduct = { id: string; name: string; sku: string | null; price: number; unit: string | null };
type FinanceAccount = { id: string; name: string; type: string };

function HospitalityOrderActions({ orgId, orderId, orderNumber, status, total, writable, onDone }: {
 orgId: string; orderId: string; orderNumber: string; status: string; total: number; writable: boolean; onDone: () => void;
}) {
 const [open,setOpen]=useState(false);
 const [productId,setProductId]=useState("");
 const [description,setDescription]=useState("");
 const [quantity,setQuantity]=useState("1");
 const [unitPrice,setUnitPrice]=useState("");
 const [taxRate,setTaxRate]=useState("14");
 const [accountId,setAccountId]=useState("");
 const [paymentMethod,setPaymentMethod]=useState("cash");
 const qc=useQueryClient();
 const closed=status==="paid"||status==="cancelled";
 const productsQuery=useQuery({
  queryKey:["hospitality-products",orgId],
  enabled:open,
  queryFn:async()=>{
   const {data,error}=await db.from("products").select("id,name,sku,price,unit").eq("organization_id",orgId).eq("is_active",true).order("name");
   if(error) throw error;
   return (data??[]) as HospitalityProduct[];
  }
 });
 const itemsQuery=useQuery({
  queryKey:["hospitality-order-items",orgId,orderId],
  enabled:open,
  queryFn:async()=>{
   const {data,error}=await db.from("hospitality_order_items").select("id,product_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,sort_order").eq("organization_id",orgId).eq("order_id",orderId).order("sort_order");
   if(error) throw error;
   return (data??[]) as HospitalityItem[];
  }
 });
 const accountsQuery=useQuery({
  queryKey:["hospitality-finance-accounts",orgId],
  enabled:open&&!closed,
  queryFn:async()=>{
   const {data,error}=await db.from("bank_accounts").select("id,name,type,is_active").eq("organization_id",orgId).eq("is_active",true).order("name");
   if(error) throw error;
   return (data??[]) as FinanceAccount[];
  }
 });
 const items=itemsQuery.data??[];
 const calculatedTotal=items.reduce((sum,item)=>sum+Number(item.line_subtotal)+Number(item.line_tax),0);
 async function addItem(e:FormEvent){
  e.preventDefault();
  const qty=Number(quantity),price=Number(unitPrice),tax=Number(taxRate);
  if(!description.trim()||!(qty>0)||!(price>=0)||!(tax>=0&&tax<=100)) return toast.error("Verifique a descrição, quantidade, preço e IVA.");
  const nextOrder=Math.max(-1,...items.map(item=>Number(item.sort_order??-1)))+1;
  const {error}=await db.from("hospitality_order_items").insert({order_id:orderId,organization_id:orgId,product_id:productId||null,description:description.trim(),quantity:qty,unit_price:price,tax_rate:tax,sort_order:nextOrder});
  if(error) return toast.error(errMsg(error));
  setProductId("");setDescription("");setQuantity("1");setUnitPrice("");
  await Promise.all([itemsQuery.refetch(),qc.invalidateQueries({queryKey:["department-records",orgId,"hospitality_orders"]})]);
 }
 async function removeItem(itemId:string){
  const {error}=await db.from("hospitality_order_items").delete().eq("id",itemId).eq("order_id",orderId);
  if(error) return toast.error(errMsg(error));
  await Promise.all([itemsQuery.refetch(),qc.invalidateQueries({queryKey:["department-records",orgId,"hospitality_orders"]})]);
 }
 async function settle(){
  if(!accountId) return toast.error("Selecione a conta financeira que vai receber o pagamento.");
  if(items.length===0||calculatedTotal<=0) return toast.error("Adicione pelo menos um artigo com valor válido.");
  const {error}=await db.rpc("settle_hospitality_order",{_order:orderId,_account:accountId,_payment_method:paymentMethod});
  if(error) return toast.error(errMsg(error));
  toast.success("Venda fechada; pagamento registado e stock atualizado.");
  await Promise.all([qc.invalidateQueries({queryKey:["department-records",orgId,"hospitality_orders"]}),qc.invalidateQueries({queryKey:["finance"]}),qc.invalidateQueries({queryKey:["dashboard"]}),itemsQuery.refetch()]);
  onDone();setOpen(false);
 }
 return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}>{status==="paid"||status==="cancelled"?"Ver pedido":"Linhas / pagar"}</Button>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>Pedido POS · {orderNumber}</DialogTitle></DialogHeader>
    <div className="space-y-3">
     {itemsQuery.isLoading?<p className="text-sm text-muted-foreground">A carregar linhas…</p>:itemsQuery.isError?<p className="text-sm text-destructive">Não foi possível carregar as linhas do pedido.</p>:<div className="overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Artigo</th><th className="p-2 text-right">Qtd.</th><th className="p-2 text-right">Preço</th><th className="p-2 text-right">Total</th>{writable&&!closed&&<th className="p-2"/>}</tr></thead><tbody>{items.map(item=><tr key={item.id} className="border-b last:border-0"><td className="p-2">{item.description}</td><td className="num p-2 text-right">{Number(item.quantity)}</td><td className="num p-2 text-right">{formatKz(item.unit_price)}</td><td className="num p-2 text-right">{formatKz(Number(item.line_subtotal)+Number(item.line_tax))}</td>{writable&&!closed&&<td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={()=>removeItem(item.id)}>Remover</Button></td>}</tr>)}{items.length===0&&<tr><td colSpan={writable&&!closed?5:4} className="p-4 text-center text-muted-foreground">Adicione o primeiro artigo ao pedido.</td></tr>}</tbody></table></div>}
     {writable&&!closed&&<form onSubmit={addItem} className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2"><Label>Catálogo de produtos (opcional)</Label><Select value={productId||"manual"} onValueChange={value=>{const product=productsQuery.data?.find(p=>p.id===value);setProductId(value==="manual"?"":value);if(product){setDescription(product.name);setUnitPrice(String(product.price??0));}}}><SelectTrigger><SelectValue placeholder="Escolher produto"/></SelectTrigger><SelectContent><SelectItem value="manual">Linha manual / serviço</SelectItem>{(productsQuery.data??[]).map(product=><SelectItem key={product.id} value={product.id}>{product.name}{product.sku ? " · " + product.sku : ""}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Descrição</Label><Input required maxLength={200} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Artigo ou serviço"/></div>
      <div className="space-y-1"><Label>Quantidade</Label><Input required type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></div>
      <div className="space-y-1"><Label>Preço unitário (Kz)</Label><Input required type="number" min="0" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} placeholder="0,00"/></div>
      <div className="space-y-1"><Label>IVA (%)</Label><Input required type="number" min="0" max="100" step="0.01" value={taxRate} onChange={e=>setTaxRate(e.target.value)}/></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={closed}>Adicionar artigo</Button></div>
     </form>}
     <div className="flex items-center justify-between border-t pt-3"><div><p className="text-xs text-muted-foreground">Total calculado no servidor</p><p className="num text-xl font-semibold">{formatKz(total||calculatedTotal)}</p></div>{status==="paid"&&<span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700">Pago</span>}</div>
     {writable&&!closed&&<div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-semibold">Fechar venda</p>
      {accountsQuery.isLoading?<p className="text-sm text-muted-foreground">A carregar contas financeiras…</p>:accountsQuery.isError?<p className="text-sm text-destructive">Não foi possível carregar contas. Confirme se Finanças está incluída no plano.</p>:accountsQuery.data?.length?<><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1"><Label>Conta de recebimento</Label><Select value={accountId||"none"} onValueChange={value=>setAccountId(value==="none"?"":value)}><SelectTrigger><SelectValue placeholder="Escolher conta"/></SelectTrigger><SelectContent><SelectItem value="none">Escolher conta</SelectItem>{accountsQuery.data.map(account=><SelectItem key={account.id} value={account.id}>{account.name} · {account.type}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Método de pagamento</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash">Numerário</SelectItem><SelectItem value="multicaixa">Multicaixa Express</SelectItem><SelectItem value="card">Cartão</SelectItem><SelectItem value="transfer">Transferência</SelectItem><SelectItem value="other">Outro</SelectItem></SelectContent></Select></div></div><Button onClick={settle} disabled={!accountId||items.length===0||calculatedTotal<=0}>Confirmar pagamento e baixar stock</Button></>:<p className="text-sm text-muted-foreground">Crie uma conta em Finanças e confirme que o plano inclui Finanças para fechar esta venda.</p>}
     </div>}
     <p className="text-xs text-muted-foreground">O pagamento, a saída de stock e a atualização do pedido são feitos numa única transação. Se faltar stock ou a conta não pertencer à empresa, nada é confirmado.</p>
    </div>
   </DialogContent>
  </Dialog>
 </>;
}

function Departments() {
 const { orgId, current, can } = useOrg();
 const qc = useQueryClient();
 const [active, setActive] = useState<string>(platforms[0].id);
 const [formOpen, setFormOpen] = useState(false);
 const [form, setForm] = useState<Record<string,string>>({});
 const entitlementQuery = useQuery({
  queryKey:["department-platform-entitlements",orgId],
  enabled:!!orgId,
  queryFn:async()=>{
   const [{data:sub,error:subError},{data:organization,error:organizationError}]=await Promise.all([
    db.from("subscriptions").select("plan_id,status,current_period_end,trial_ends_at,created_at").eq("organization_id",orgId!).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("organizations").select("trial_ends_at,status").eq("id",orgId!).maybeSingle()
   ]);
   if(subError) throw subError;
   if(organizationError) throw organizationError;
   const now=Date.now();
   const trialEndsAt=sub?.trial_ends_at ?? organization?.trial_ends_at;
   const activeSubscription=!!sub && ["active","trial"].includes(sub.status) && (!sub.current_period_end || new Date(sub.current_period_end).getTime()>=now) && (sub.status!=="trial" || !trialEndsAt || new Date(trialEndsAt).getTime()>=now) && !["cancelled","canceled","suspended","deleted","inactive"].includes(String(organization?.status ?? "").toLowerCase());
   if(!sub || !activeSubscription) return [] as string[];
   const {data,error}=await db.from("plan_platforms").select("platform_code").eq("plan_id",sub.plan_id).eq("enabled",true);
   if(error) throw error;
   return (data??[]).map((row:{platform_code:string})=>row.platform_code) as string[];
  }
 });
 const availablePlatforms = useMemo(() => platforms.filter(p => (entitlementQuery.data?.includes(platformEntitlementCode[p.id] ?? "") || (p.id==="hospitality_orders" && (entitlementQuery.data?.includes("restaurant") || entitlementQuery.data?.includes("pos")))) && (platformReadRoles[p.id]?.includes(current?.role ?? "") ?? false)), [entitlementQuery.data,current?.role]);
 const platform = useMemo(() => availablePlatforms.find(p => p.id === active) ?? availablePlatforms[0] ?? platforms[0], [availablePlatforms,active]);
 const writable = (platformWriteRoles[platform.id]?.includes(current?.role ?? "") ?? false) || can(["owner","admin"]);
 const query = useQuery({
  queryKey:["department-records",orgId,platform.table],
  enabled:!!orgId && availablePlatforms.some(p=>p.id===platform.id),
  queryFn:async()=>{ const {data,error}=await db.from(platform.table).select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(250); if(error) throw error; return data ?? []; }
 });
 async function createRecord() {
  if(!orgId) return;
  const required = platform.fields.filter(f => ["full_name","employee_number","code","name","reference","title","order_number","product_name","quantity_planned","student_number","academic_year"].includes(f[0])).map(f=>f[0]);
  for(const key of required) if(!form[key]?.trim()) return toast.error("Preencha os campos obrigatórios.");
  const payload:Record<string,unknown>={organization_id:orgId,created_by:(await supabase.auth.getUser()).data.user?.id};
  for(const [key,value] of Object.entries(form)) if(value.trim()) payload[key]=["budget","quantity_planned"].includes(key)?Number(value):value;
  if(platform.id==="production_orders") payload["quantity_completed"]=0;
  const {error}=await db.from(platform.table).insert(payload);
  if(error) return toast.error(errMsg(error));
  toast.success("Registo criado."); setForm({}); setFormOpen(false); qc.invalidateQueries({queryKey:["department-records",orgId]});
 }
 async function changeStatus(id:string,status:string) {
  const {error}=await db.from(platform.table).update({[platform.status]:status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",orgId);
  if(error) return toast.error(errMsg(error));
  toast.success("Estado atualizado."); qc.invalidateQueries({queryKey:["department-records",orgId]});
 }
 if(!can(["owner","admin","director","manager","supervisor","operator","employee","accountant","teacher","support","auditor","sales"])) return <NoAccess />;
 if(entitlementQuery.isLoading) return <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">A verificar as plataformas incluídas na assinatura…</div>;
 if(entitlementQuery.isError) return <div className="rounded-lg border border-destructive/30 bg-card p-6 text-sm text-destructive">Não foi possível verificar as permissões da assinatura. Tente novamente.</div>;
 if(availablePlatforms.length===0) return <><PageHeader title="Plataformas departamentais" description="As áreas de trabalho são disponibilizadas conforme o plano da organização."/><div className="rounded-xl border bg-card p-6"><p className="font-semibold">Nenhuma plataforma departamental incluída</p><p className="mt-2 text-sm text-muted-foreground">O plano atual não inclui estas áreas, ou a assinatura não está ativa. Consulte os direitos do plano antes de continuar.</p><Link className="mt-4 inline-flex text-sm font-medium text-cyan underline" to="/app/planos">Ver plano e assinatura</Link></div></>;
 const Icon=platform.icon;
 return <>
  <PageHeader title="Plataformas departamentais" description="Áreas de trabalho integradas na mesma organização. Os registos são separados por empresa." />
  <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
   {availablePlatforms.map(p=>{const I=p.icon; return <button key={p.id} onClick={()=>{setActive(p.id);setForm({});setFormOpen(false);}} className={`rounded-xl border p-3 text-left transition ${active===p.id?"border-cyan-500 bg-cyan-500/10 shadow-sm":"bg-card hover:border-cyan-500/40"}`}><div className="flex items-center gap-2"><I className="h-4 w-4 text-cyan-600"/><span className="text-sm font-semibold">{p.title}</span></div><p className="mt-2 text-xs text-muted-foreground">{p.fields.length} campos de registo</p></button>})}
  </div>
  <section className="rounded-xl border bg-card p-4 md:p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-600"/><div><h2 className="font-semibold">{platform.title}</h2><p className="text-xs text-muted-foreground">{query.data?.length ?? 0} registos carregados (máx. 250)</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>query.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>{writable&&<Button size="sm" onClick={()=>setFormOpen(v=>!v)}><Plus className="mr-2 h-4 w-4"/>Novo registo</Button>}</div></div>
   {formOpen&&<div className="mt-4 rounded-lg border bg-muted/30 p-4"><h3 className="mb-3 text-sm font-semibold">Criar registo · {platform.title}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{platform.fields.map(([key,label])=><div key={key} className="space-y-1"><Label htmlFor={key}>{label}{["full_name","employee_number","code","name","reference","title","order_number","product_name","quantity_planned","student_number","academic_year"].includes(key)?" *":""}</Label><Input id={key} value={form[key]??""} onChange={e=>setForm(s=>({...s,[key]:e.target.value}))} type={key==="scheduled_at"?"datetime-local":key.includes("date")?"date":key==="budget"||key==="quantity_planned"?"number":"text"} required={["quantity_planned","academic_year"].includes(key)} placeholder={label}/></div>)}</div><div className="mt-4 flex gap-2"><Button onClick={createRecord}>Guardar registo</Button><Button variant="outline" onClick={()=>setFormOpen(false)}>Cancelar</Button></div></div>}
   {query.isLoading?<p className="py-10 text-center text-sm text-muted-foreground">A carregar registos…</p>:query.error?<div className="py-8 text-center"><p className="text-sm text-destructive">Não foi possível carregar os registos.</p><p className="mt-1 text-xs text-muted-foreground">{errMsg(query.error)}</p><Button className="mt-3" variant="outline" onClick={()=>query.refetch()}>Tentar novamente</Button></div>:!query.data?.length?<div className="py-12 text-center"><Icon className="mx-auto h-8 w-8 text-muted-foreground/50"/><p className="mt-3 font-medium">Ainda sem registos</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro registo desta área.</p></div>:<div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{[platform.code,platform.name,platform.status,"created_at"].map(k=><th key={k} className="px-3 py-3 font-medium">{k==="created_at"?"Criado em":k===platform.code?"Referência":k===platform.name?"Descrição":"Estado"}</th>)}<th className="px-3 py-3">Ação</th></tr></thead><tbody>{query.data.map((row: { id: string; created_at: string; [key: string]: string | number | null })=><tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 font-mono text-xs">{row[platform.code]??"—"}</td><td className="px-3 py-3 font-medium">{row[platform.name]??"—"}</td><td className="px-3 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{row[platform.status]??"—"}</span></td><td className="px-3 py-3 text-xs text-muted-foreground">{row.created_at?formatDate(row.created_at):"—"}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-2">{writable && !(platform.id==="hospitality_orders" && row[platform.status]==="paid")?<Select value={String(row[platform.status] ?? "")} onValueChange={v=>changeStatus(row.id,v)}><SelectTrigger className="h-8 w-36"><SelectValue/></SelectTrigger><SelectContent>{platform.statuses.filter(s=>!(platform.id==="hospitality_orders"&&s==="paid")).map(s=><SelectItem key={s} value={s}>{s.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select>:"—"}{platform.id==="hospitality_orders" && orgId && <HospitalityOrderActions orgId={orgId} orderId={row.id} orderNumber={String(row[platform.code] ?? "")} status={String(row[platform.status] ?? "")} total={Number(row["total"] ?? 0)} writable={writable} onDone={()=>query.refetch()}/>}</div></td></tr>)}</tbody></table></div>}
  </section>
  <p className="mt-4 text-xs text-muted-foreground">Esta entrega fornece criação, listagem e atualização de estado dos registos base. Fluxos especializados como salários, assiduidade, notas, receitas POS, consumo de materiais e assinatura digital exigem os respetivos modelos e validações adicionais.</p>
 </>;
}
