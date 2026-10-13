import { createFileRoute, Link } from "@tanstack/react-router";
import { MODULES } from "@/lib/modules";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/app/modulos")({
  head: () => ({ meta: [{ title: "Módulos — Nexora" }, { name: "description", content: "Os 24 módulos da suite." }, { property: "og:title", content: "Módulos — Nexora" }, { property: "og:description", content: "Os 24 módulos da suite." }] }),
  component: Modules,
});

function Modules() {
  return (
    <>
      <PageHeader title="Módulos" description="Os módulos disponíveis já funcionam com dados reais. Os restantes chegam nas próximas fases." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const body = (
            <>
              <div className="num text-xs text-muted-foreground">{String(m.n).padStart(2, "0")}</div>
              <div className="mt-1 font-medium">{m.name}</div>
              <div className={`mt-2 text-xs ${m.status === "live" ? "text-copper" : "text-muted-foreground"}`}>{m.status === "live" ? "Disponível →" : "Próxima fase"}</div>
            </>
          );
          return m.to ? (
            <Link key={m.n} to={m.to} className="rounded-lg border bg-card p-4 shadow-soft hover:border-copper">{body}</Link>
          ) : (
            <div key={m.n} className="rounded-lg border border-dashed bg-card/60 p-4">{body}</div>
          );
        })}
      </div>
    </>
  );
}
