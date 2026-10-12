import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, SALES_WRITE } from "@/lib/org";
import { PageHeader, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Nexora" }, { name: "description", content: "Carteira de clientes." }, { property: "og:title", content: "Clientes — Nexora" }, { property: "og:description", content: "Carteira de clientes." }] }),
  component: Customers,
});

type C = { id?: string; name: string; nif: string; email: string; phone: string; address: string };
const blank: C = { name: "", nif: "", email: "", phone: "", address: "" };

function Customers() {
  const { orgId, can } = useOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<C | null>(null);
  const q = useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return data;
    },
  });
  const list = (q.data ?? []).filter((c) => `${c.name} ${c.nif ?? ""} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (edit.email && !/^\S+@\S+\.\S+$/.test(edit.email)) return toast.error("Email inválido.");
    const row = { name: edit.name.trim(), nif: edit.nif || null, email: edit.email || null, phone: edit.phone || null, address: edit.address || null };
    const { error } = edit.id
      ? await supabase.from("customers").update(row).eq("id", edit.id)
      : await supabase.from("customers").insert({ ...row, organization_id: orgId! });
    if (error) return toast.error(errMsg(error));
    toast.success("Cliente guardado.");
    setEdit(null); qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const canWrite = can(SALES_WRITE);
  return (
    <>
      <PageHeader title="Clientes" description={`${q.data?.length ?? 0} registados`} actions={canWrite && <Button variant="copper" onClick={() => setEdit(blank)}>Novo cliente</Button>} />
      <Input placeholder="Pesquisar por nome, NIF ou email" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
      {q.data && q.data.length === 0 ? (
        <Empty title="Sem clientes" hint="Adicione o seu primeiro cliente para começar a faturar." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">NIF</th><th className="px-4 py-2">Contacto</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="num px-4 py-2">{c.nif || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2 text-right">{canWrite && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: c.id, name: c.name, nif: c.nif ?? "", email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "" })}>Editar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          {edit && (
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-1"><Label>Nome</Label><Input required maxLength={150} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>NIF</Label><Input maxLength={20} value={edit.nif} onChange={(e) => setEdit({ ...edit, nif: e.target.value })} /></div>
                <div className="space-y-1"><Label>Telefone</Label><Input maxLength={20} placeholder="+244" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" maxLength={150} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Morada</Label><Input maxLength={250} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
              <Button type="submit" className="w-full">Guardar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
