import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { MODULES } from "@/lib/modules";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexora Business Suite — Gestão empresarial em Angola" },
      { name: "description", content: "Finanças, faturação, clientes e equipa numa única plataforma para empresas angolanas, em Kwanza." },
      { property: "og:title", content: "Nexora Business Suite" },
      { property: "og:description", content: "Gestão empresarial integrada para empresas angolanas." },
    ],
  }),
  component: Index,
});

function Index() {
  const { session } = useSession();
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        {session ? (
          <Button asChild variant="copper"><Link to="/app">Abrir painel</Link></Button>
        ) : (
          <Button asChild variant="copper"><Link to="/auth">Entrar</Link></Button>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-24">
        <p className="text-sm uppercase tracking-[0.2em] text-sidebar-primary">Angola · AOA/Kz</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-sidebar-accent-foreground md:text-6xl">
          Toda a operação da sua empresa, num só lugar.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-sidebar-foreground/80">
          Tesouraria, faturação, clientes, equipa e auditoria, com dados isolados por empresa e permissões por função.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="copper"><Link to="/auth">Criar conta gratuita</Link></Button>
        </div>
        <section className="mt-20 grid gap-px overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-border sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.n} className="bg-sidebar p-4">
              <div className="num text-xs text-sidebar-foreground/50">{String(m.n).padStart(2, "0")}</div>
              <div className="mt-1 text-sm text-sidebar-accent-foreground">{m.name}</div>
              <div className={`mt-2 text-xs ${m.status === "live" ? "text-sidebar-primary" : "text-sidebar-foreground/50"}`}>
                {m.status === "live" ? "Disponível" : "Próxima fase"}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
