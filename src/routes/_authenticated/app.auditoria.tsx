import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader, Empty, NoAccess } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/app/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Nexora" }, { name: "description", content: "Registo de alterações." }, { property: "og:title", content: "Auditoria — Nexora" }, { property: "og:description", content: "Registo de alterações." }] }),
  component: Audit,
});

const ENT: Record<string, string> = { invoices: "Documento", customers: "Cliente", transactions: "Movimento", bank_accounts: "Conta", organization_members: "Membro", organizations: "Empresa", subscriptions: "Assinatura", subscription_payments: "Pagamento" };
const ACT: Record<string, string> = { insert: "Criou", update: "Alterou", delete: "Apagou" };

function Audit() {
  const { orgId, can } = useOrg();
  const allowed = can(["owner", "admin", "director", "auditor", "accountant"]);
  const q = useQuery({
    queryKey: ["audit", orgId], enabled: !!orgId && allowed,
    queryFn: async () => (await supabase.from("audit_logs").select("id, action, entity, entity_id, user_id, created_at").eq("organization_id", orgId!).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  if (!allowed) return <NoAccess />;
  return (
    <>
      <PageHeader title="Auditoria" description="Últimas 200 operações registadas automaticamente." />
      {q.data?.length === 0 ? <Empty title="Sem registos" hint="As alterações aparecerão aqui." /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Quando</th><th className="px-4 py-2">Ação</th><th className="px-4 py-2">Utilizador</th></tr></thead>
            <tbody>
              {q.data?.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="num px-4 py-2 text-xs">{new Date(l.created_at).toLocaleString("pt-AO", { timeZone: "Africa/Luanda" })}</td>
                  <td className="px-4 py-2">{ACT[l.action] ?? l.action} {ENT[l.entity] ?? l.entity}</td>
                  <td className="num px-4 py-2 text-xs text-muted-foreground">{l.user_id?.slice(0, 8) ?? "sistema"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
