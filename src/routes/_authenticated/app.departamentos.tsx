import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { errMsg, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/departamentos")({
  head: () => ({ meta: [{ title: "Plataformas departamentais — Nexora" }, { name: "description", content: "Registos operacionais por departamento da organização." }] }),
  component: Departments,
});

// The tables are introduced by migration 0008_department_platforms.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const platforms = [
 { id:"hr_employees", title:"Recursos Humanos", table:"hr_employees", icon:Users, name:"full_name", code:"employee_number", status:"employment_status", statuses:["active","leave","suspended","terminated"], fields:[["employee_number","N.º funcionário"],["full_name","Nome completo"],["work_email","Email profissional"],["phone","Telefone"],["department","Departamento"],["job_title","Cargo"],["hire_date","Data de admissão"]] },
 { id:"business_projects", title:"Projetos", table:"business_projects", icon:BriefcaseBusiness, name:"name", code:"code", status:"status", statuses:["planned","active","on_hold","completed","cancelled"], fields:[["code","Código"],["name","Nome do projeto"],["description","Descrição"],["start_date","Data de início"],["due_date","Prazo"],["budget","Orçamento"]] },
 { id:"operations_work_orders", title:"Operações", table:"operations_work_orders", icon:Wrench, name:"title", code:"reference", status:"status", statuses:["open","scheduled","in_progress","blocked","completed","cancelled"], fields:[["reference","Referência"],["title","Título"],["work_type","Tipo de trabalho"],["priority","Prioridade"],["scheduled_at","Agendado para"],["notes","Notas"]] },
 { id:"production_orders", title:"Produção", table:"production_orders", icon:Factory, name:"product_name", code:"order_number", status:"status", statuses:["planned","released","in_progress","quality_check","completed","cancelled"], fields:[["order_number","N.º ordem"],["product_name","Produto"],["quantity_planned","Quantidade planeada"],["planned_start","Início previsto"],["planned_end","Fim previsto"],["notes","Notas"]] },
 { id:"education_students", title:"Educação", table:"education_students", icon:GraduationCap, name:"full_name", code:"student_number", status:"status", statuses:["active","inactive","graduated","transferred"], fields:[["student_number","N.º aluno"],["full_name","Nome completo"],["guardian_name","Encarregado"],["guardian_phone","Telefone do encarregado"],["class_name","Turma"],["academic_year","Ano letivo"]] },
 { id:"hospitality_orders", title:"Hotelaria e POS", table:"hospitality_orders", icon:Hotel, name:"order_number", code:"order_number", status:"status", statuses:["open","confirmed","preparing","ready","served","paid","cancelled"], fields:[["order_number","N.º pedido"],["order_type","Tipo (pos/restaurant/takeaway)"],["table_reference","Mesa"],["notes","Notas"]] },
 { id:"legal_documents", title:"Jurídico", table:"legal_documents", icon:Scale, name:"title", code:"reference", status:"status", statuses:["draft","review","approved","signed","expired","archived"], fields:[["reference","Referência"],["title","Título"],["document_type","Tipo de documento"],["counterparty","Contraparte"],["effective_date","Data de início"],["expiry_date","Data de validade"],["notes","Notas"]] },
] as const;

function Departments() {
 const { orgId, can } = useOrg();
 const qc = useQueryClient();
 const [active, setActive] = useState<string>(platforms[0].id);
 const [formOpen, setFormOpen] = useState(false);
 const [form, setForm] = useState<Record<string,string>>({});
 const platform = useMemo(() => platforms.find(p => p.id === active) ?? platforms[0], [active]);
 const writable = can(["owner","admin","director","manager","supervisor","operator","employee","accountant","teacher","support"]);
 const query = useQuery({
  queryKey:["department-records",orgId,platform.table],
  enabled:!!orgId,
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
 const Icon=platform.icon;
 return <>
  <PageHeader title="Plataformas departamentais" description="Áreas de trabalho integradas na mesma organização. Os registos são separados por empresa." />
  <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
   {platforms.map(p=>{const I=p.icon; return <button key={p.id} onClick={()=>{setActive(p.id);setForm({});setFormOpen(false);}} className={`rounded-xl border p-3 text-left transition ${active===p.id?"border-cyan-500 bg-cyan-500/10 shadow-sm":"bg-card hover:border-cyan-500/40"}`}><div className="flex items-center gap-2"><I className="h-4 w-4 text-cyan-600"/><span className="text-sm font-semibold">{p.title}</span></div><p className="mt-2 text-xs text-muted-foreground">{p.fields.length} campos de registo</p></button>})}
  </div>
  <section className="rounded-xl border bg-card p-4 md:p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-600"/><div><h2 className="font-semibold">{platform.title}</h2><p className="text-xs text-muted-foreground">{query.data?.length ?? 0} registos carregados (máx. 250)</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>query.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>{writable&&<Button size="sm" onClick={()=>setFormOpen(v=>!v)}><Plus className="mr-2 h-4 w-4"/>Novo registo</Button>}</div></div>
   {formOpen&&<div className="mt-4 rounded-lg border bg-muted/30 p-4"><h3 className="mb-3 text-sm font-semibold">Criar registo · {platform.title}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{platform.fields.map(([key,label])=><div key={key} className="space-y-1"><Label htmlFor={key}>{label}{["full_name","employee_number","code","name","reference","title","order_number","product_name","quantity_planned","student_number","academic_year"].includes(key)?" *":""}</Label><Input id={key} value={form[key]??""} onChange={e=>setForm(s=>({...s,[key]:e.target.value}))} type={key==="scheduled_at"?"datetime-local":key.includes("date")?"date":key==="budget"||key==="quantity_planned"?"number":"text"} required={["quantity_planned","academic_year"].includes(key)} placeholder={label}/></div>)}</div><div className="mt-4 flex gap-2"><Button onClick={createRecord}>Guardar registo</Button><Button variant="outline" onClick={()=>setFormOpen(false)}>Cancelar</Button></div></div>}
   {query.isLoading?<p className="py-10 text-center text-sm text-muted-foreground">A carregar registos…</p>:query.error?<div className="py-8 text-center"><p className="text-sm text-destructive">Não foi possível carregar os registos.</p><p className="mt-1 text-xs text-muted-foreground">{errMsg(query.error)}</p><Button className="mt-3" variant="outline" onClick={()=>query.refetch()}>Tentar novamente</Button></div>:!query.data?.length?<div className="py-12 text-center"><Icon className="mx-auto h-8 w-8 text-muted-foreground/50"/><p className="mt-3 font-medium">Ainda sem registos</p><p className="mt-1 text-sm text-muted-foreground">Crie o primeiro registo desta área.</p></div>:<div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{[platform.code,platform.name,platform.status,"created_at"].map(k=><th key={k} className="px-3 py-3 font-medium">{k==="created_at"?"Criado em":k===platform.code?"Referência":k===platform.name?"Descrição":"Estado"}</th>)}<th className="px-3 py-3">Ação</th></tr></thead><tbody>{query.data.map((row: { id: string; created_at: string; [key: string]: string | number | null })=><tr key={row.id} className="border-b last:border-0"><td className="px-3 py-3 font-mono text-xs">{row[platform.code]??"—"}</td><td className="px-3 py-3 font-medium">{row[platform.name]??"—"}</td><td className="px-3 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{row[platform.status]??"—"}</span></td><td className="px-3 py-3 text-xs text-muted-foreground">{row.created_at?formatDate(row.created_at):"—"}</td><td className="px-3 py-3">{writable?<Select value={String(row[platform.status] ?? "")} onValueChange={v=>changeStatus(row.id,v)}><SelectTrigger className="h-8 w-36"><SelectValue/></SelectTrigger><SelectContent>{platform.statuses.map(s=><SelectItem key={s} value={s}>{s.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select>:"—"}</td></tr>)}</tbody></table></div>}
  </section>
  <p className="mt-4 text-xs text-muted-foreground">Esta entrega fornece criação, listagem e atualização de estado dos registos base. Fluxos especializados como salários, assiduidade, notas, receitas POS, consumo de materiais e assinatura digital exigem os respetivos modelos e validações adicionais.</p>
 </>;
}
