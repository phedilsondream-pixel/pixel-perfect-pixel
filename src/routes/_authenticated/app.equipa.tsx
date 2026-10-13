import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, ADMINS } from "@/lib/org";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, errMsg, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/equipa")({
  head: () => ({ meta: [{ title: "Equipa — Nexora" }, { name: "description", content: "Utilizadores e funções." }, { property: "og:title", content: "Equipa — Nexora" }, { property: "og:description", content: "Utilizadores e funções." }] }),
  component: Team,
});

function Team() {
  const { orgId, can } = useOrg();
  const { session } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["members", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("organization_members").select("*").eq("organization_id", orgId!).order("created_at")).data ?? [],
  });
  const admin = can(ADMINS);
  async function setRole(id: string, role: string) {
    const { error } = await supabase.from("organization_members").update({ role: role as "admin" }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Função atualizada."); qc.invalidateQueries({ queryKey: ["members"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("organization_members").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Utilizador removido."); qc.invalidateQueries({ queryKey: ["members"] });
  }
  return (
    <>
      <PageHeader title="Equipa" description={`${q.data?.length ?? 0} utilizador(es)`} />
      <div className="mb-4 rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Convites por email ficam disponíveis assim que o envio de emails for configurado. Até lá, a equipa é composta por quem criou a empresa.
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Utilizador</th><th className="px-4 py-2">Função</th><th className="px-4 py-2">Desde</th><th /></tr></thead>
          <tbody>
            {q.data?.map((m) => {
              const self = m.user_id === session?.user.id;
              const editable = admin && m.role !== "owner" && !self;
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{self ? session?.user.email : <span className="num text-xs">{m.user_id.slice(0, 8)}</span>}</td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <Select value={m.role} onValueChange={(v) => setRole(m.id, v)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                    ) : ROLE_LABELS[m.role]}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(m.created_at)}</td>
                  <td className="px-4 py-2 text-right">{editable && <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>Remover</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
