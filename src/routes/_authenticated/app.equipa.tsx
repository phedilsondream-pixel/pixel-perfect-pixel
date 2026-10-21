import { useState } from "react";
import { Input } from "@/components/ui/input";
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
      {admin && <Invites />}
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

function Invites() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [platformCode, setPlatformCode] = useState("");
  const departments = useQuery({
    queryKey: ["invitable-platforms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("department_platforms").select("code,name").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const q = useQuery({
    queryKey: ["invites", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("organization_invitations").select("*").eq("organization_id", orgId!).eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return toast.error("Email inválido.");
    if (!platformCode) return toast.error("Selecione a plataforma/departamento de destino.");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return toast.error("A sessão expirou. Entre novamente.");
    const { error } = await supabase.from("organization_invitations").insert({
      organization_id: orgId!, email: clean, role, platform_code: platformCode, invited_by: authData.user.id,
    });
    if (error) return toast.error(error.code === "23505" ? "Já existe um convite pendente para este email." : errMsg(error));
    toast.warning("Convite registado na plataforma. O envio de email ainda não está ligado; avise a pessoa por outro canal.");
    setEmail(""); setPlatformCode(""); qc.invalidateQueries({ queryKey: ["invites"] });
  }
  async function revoke(id: string) {
    const { error } = await supabase.from("organization_invitations").update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    qc.invalidateQueries({ queryKey: ["invites"] });
  }
  return (
    <div className="mb-6 rounded-lg border bg-card p-4 shadow-soft">
      <h2 className="font-semibold">Convidar membro</h2>
      <p className="mt-1 text-sm text-muted-foreground">A pessoa entra automaticamente nesta empresa quando criar conta (ou entrar) com este email confirmado. O envio do convite por email fica ativo quando o domínio de email for configurado; até lá, avise a pessoa diretamente.</p>
      <form onSubmit={invite} className="mt-3 flex flex-wrap gap-2">
        <Input type="email" required maxLength={150} placeholder="email@empresa.ao" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
        <Select value={platformCode} onValueChange={setPlatformCode}><SelectTrigger className="w-56"><SelectValue placeholder="Plataforma de destino" /></SelectTrigger>
          <SelectContent>{(departments.data ?? []).map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Button type="submit" variant="copper" disabled={!platformCode || departments.isLoading}>Registar convite</Button>
      </form>
      {q.data && q.data.length > 0 && (
        <div className="mt-4 divide-y text-sm">
          {q.data.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-2">
              <span>{i.email} · {ROLE_LABELS[i.role] ?? i.role} · {departments.data?.find((d) => d.code === i.platform_code)?.name ?? "Plataforma"} · <span className="text-muted-foreground">pendente</span></span>
              <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>Cancelar</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
