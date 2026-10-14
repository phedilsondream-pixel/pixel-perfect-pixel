import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, FileText, Users, ShieldCheck, Cloud, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { MODULES } from "@/lib/modules";
import { Logo } from "@/components/Logo";
import footerBg from "@/assets/footer-tech.svg";
import authBg from "@/assets/auth-tech.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexora Business Suite — Gestão empresarial em Angola" },
      { name: "description", content: "Finanças, faturação, clientes e equipa numa única plataforma para empresas angolanas, em Kwanza." },
      { property: "og:title", content: "Nexora Business Suite" },
      { property: "og:description", content: "Tudo o que o seu negócio precisa, num só lugar." },
    ],
  }),
  component: Index,
});

const HIGHLIGHTS = [
  { icon: LayoutDashboard, t: "Painel", d: "Indicadores calculados a partir dos seus dados." },
  { icon: Wallet, t: "Finanças", d: "Contas, caixa e movimentos com histórico." },
  { icon: FileText, t: "Faturação", d: "Numeração sequencial, IVA e pagamentos." },
  { icon: Users, t: "Clientes", d: "Carteira de clientes partilhada pela equipa." },
];

function Index() {
  const { session } = useSession();
  const cta = session ? { to: "/app" as const, label: "Abrir painel" } : { to: "/auth" as const, label: "Entrar" };
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-brand-dark text-sidebar-foreground">
        <img src={authBg} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo />
          <Button asChild variant="copper"><Link to={cta.to}>{cta.label}</Link></Button>
        </header>
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan">Angola · AOA/Kz</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold text-sidebar-accent-foreground md:text-6xl">Tudo o que o seu negócio precisa, num só lugar.</h1>
          <p className="mt-6 max-w-xl text-lg">Tesouraria, faturação, clientes, equipa e auditoria, com dados isolados por empresa e permissões por função.</p>
          <div className="mt-10"><Button asChild size="lg" variant="copper"><Link to="/auth">Criar conta gratuita</Link></Button></div>
        </div>
      </section>

      <section className="mx-auto -mt-10 grid max-w-6xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map((h) => (
          <div key={h.t} className="relative rounded-xl border bg-card p-5 shadow-soft">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-gradient text-primary-foreground"><h.icon className="h-5 w-5" /></div>
            <div className="mt-3 font-semibold">{h.t}</div>
            <p className="mt-1 text-sm text-muted-foreground">{h.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold">Os 24 módulos da suite</h2>
        <p className="mt-1 text-sm text-muted-foreground">Os módulos disponíveis já funcionam. Os restantes chegam em fases.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.n} className={`rounded-lg border bg-card p-4 ${m.status === "live" ? "" : "border-dashed"}`}>
              <div className="num text-xs text-muted-foreground">{String(m.n).padStart(2, "0")}</div>
              <div className="mt-1 text-sm font-medium">{m.name}</div>
              <div className={`mt-2 text-xs font-medium ${m.status === "live" ? "text-primary" : "text-muted-foreground"}`}>{m.status === "live" ? "Disponível" : "Próxima fase"}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <img src={footerBg} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-3">
          <div><Logo /><p className="mt-4 max-w-xs text-sm">Mais controlo. Mais eficiência. Mais crescimento.</p></div>
          <div className="flex flex-col gap-3 text-sm">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan" />Dados isolados por empresa</span>
            <span className="flex items-center gap-2"><Cloud className="h-4 w-4 text-cyan" />Acesso a partir de qualquer lugar</span>
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-cyan" />Pensado para ligações lentas</span>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Link to="/auth" className="hover:text-sidebar-accent-foreground">Entrar</Link>
            <Link to="/auth" className="hover:text-sidebar-accent-foreground">Criar conta</Link>
          </div>
        </div>
        <div className="relative border-t border-sidebar-border py-4 text-center text-xs">© {new Date().getFullYear()} Nexora Business Suite</div>
      </footer>
    </div>
  );
}
