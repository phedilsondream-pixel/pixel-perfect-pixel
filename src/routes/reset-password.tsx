import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova palavra-passe — Nexora" },
      { name: "description", content: "Defina uma nova palavra-passe para a sua conta Nexora." },
      { property: "og:title", content: "Nova palavra-passe — Nexora" },
      { property: "og:description", content: "Defina uma nova palavra-passe." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Mínimo de 8 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(errMsg(error));
    toast.success("Palavra-passe atualizada.");
    navigate({ to: "/app" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Nova palavra-passe</h1>
        <div className="space-y-2"><Label htmlFor="pw">Palavra-passe</Label><Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <Button type="submit" className="w-full">Guardar</Button>
      </form>
    </div>
  );
}
