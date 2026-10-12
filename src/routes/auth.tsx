import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useSession } from "@/lib/session";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Nexora Business Suite" },
      { name: "description", content: "Aceda à sua conta Nexora ou crie uma nova." },
      { property: "og:title", content: "Entrar — Nexora" },
      { property: "og:description", content: "Aceda à sua conta Nexora Business Suite." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "reset";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => { if (session) navigate({ to: "/app" }); }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("A palavra-passe deve ter pelo menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/app`, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Conta criada. Confirme o seu email para continuar.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Enviámos um link de recuperação para o seu email.");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(errMsg(r.error));
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 md:flex">
        <Logo />
        <p className="max-w-sm font-display text-3xl text-sidebar-accent-foreground">Gestão séria para empresas que crescem em Angola.</p>
        <p className="text-xs text-sidebar-foreground/60">© Nexora</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden"><Logo tone="light" /></div>
          <div>
            <h1 className="text-2xl font-semibold">
              {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar palavra-passe"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signup" ? "Comece com 14 dias de teste." : "Bem-vindo à Nexora Business Suite."}
            </p>
          </div>
          {mode !== "reset" && (
            <>
              <Button type="button" variant="outline" className="w-full" onClick={google}>Continuar com Google</Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
            </>
          )}
          {mode === "signup" && (
            <div className="space-y-2"><Label htmlFor="name">Nome completo</Label><Input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          )}
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "reset" && (
            <div className="space-y-2"><Label htmlFor="pw">Palavra-passe</Label><Input id="pw" type="password" required minLength={mode === "signup" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "A processar…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </Button>
          <div className="flex justify-between text-sm">
            {mode === "login" ? (
              <>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("reset")}>Esqueci-me da palavra-passe</button>
                <button type="button" className="font-medium text-copper" onClick={() => setMode("signup")}>Criar conta</button>
              </>
            ) : (
              <button type="button" className="font-medium text-copper" onClick={() => setMode("login")}>Já tenho conta</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
