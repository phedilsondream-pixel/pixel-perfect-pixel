export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className={`flex items-center gap-2 font-display text-lg font-semibold ${tone === "dark" ? "text-sidebar-accent-foreground" : "text-foreground"}`}>
      <span className="grid h-8 w-8 place-items-center rounded-md bg-copper text-copper-foreground">N</span>
      Nexora
    </div>
  );
}
