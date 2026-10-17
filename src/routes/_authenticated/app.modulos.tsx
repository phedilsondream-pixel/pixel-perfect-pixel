import { createFileRoute, Link } from "@tanstack/react-router";
import { PLATFORMS, PLATFORM_STATUS_LABEL } from "@/lib/modules";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/app/modulos")({
  head: () => ({
    meta: [
      { title: "Plataformas — Nexora" },
      { name: "description", content: "As dez plataformas integradas da Nexora Business Suite." },
      { property: "og:title", content: "Plataformas — Nexora" },
      { property: "og:description", content: "As dez plataformas integradas da Nexora Business Suite." },
    ],
  }),
  component: Modules,
});

function Modules() {
  return (
    <>
      <PageHeader
        title="Plataformas Nexora"
        description="Dez plataformas integradas numa única suite. O estado de cada plataforma é apresentado de forma transparente; as funcionalidades planeadas ainda não estão disponíveis."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((platform, index) => {
          const card = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="num text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    platform.status === "live"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : platform.status === "partial"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {PLATFORM_STATUS_LABEL[platform.status]}
                </span>
              </div>
              <h2 className="mt-3 font-semibold">{platform.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.description}</p>
              <div className="mt-4 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Inclui</p>
                <ul className="mt-2 space-y-1.5">
                  {platform.includes.map((item) => (
                    <li key={item} className="flex gap-2 text-sm">
                      <span aria-hidden="true" className="text-muted-foreground">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {platform.to && (
                <div className="mt-4 text-sm font-medium text-copper">
                  Abrir área disponível <span aria-hidden="true">→</span>
                </div>
              )}
            </>
          );

          return platform.to ? (
            <Link
              key={platform.id}
              to={platform.to}
              className="rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-copper"
            >
              {card}
            </Link>
          ) : (
            <article key={platform.id} className="rounded-xl border border-dashed bg-card/60 p-5">
              {card}
            </article>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Administração da plataforma, planos, permissões, auditoria e estrutura organizacional são capacidades transversais da suite, não plataformas operacionais adicionais.
      </p>
    </>
  );
}
