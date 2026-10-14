import icon from "@/assets/nexora-icon.png.asset.json";

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={icon.url} alt="" className="h-9 w-9 rounded-lg" />
      <div className="leading-none">
        <div className={`font-display text-lg font-bold ${tone === "dark" ? "text-sidebar-accent-foreground" : "text-foreground"}`}>Nexora</div>
        <div className={`mt-0.5 text-[9px] font-medium tracking-[0.3em] ${tone === "dark" ? "text-sidebar-foreground/70" : "text-muted-foreground"}`}>BUSINESS SUITE</div>
      </div>
    </div>
  );
}
