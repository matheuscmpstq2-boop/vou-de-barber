"use client";

import { FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RecuperarSenha() {
  const [step, setStep] = useState<"email" | "sent" | "checking" | "new" | "done">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("etapa") !== "nova") return;
    setStep("checking");

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = params.get("error_description") || hash.get("error_description");
    if (authError) {
      setError("Este link expirou ou é inválido. Peça um novo link abaixo.");
      setStep("email");
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setStep("new");
    });
    // The auth client may have processed the callback before this component mounted.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) setStep("new");
      else if (active) {
        setError("Este link expirou ou é inválido. Peça um novo link abaixo.");
        setStep("email");
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar-senha?etapa=nova`,
    });
    setLoading(false);
    if (sendError) {
      setError("Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.");
      return;
    }
    setStep("sent");
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== data.get("confirmation")) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
      return;
    }
    await supabase.auth.signOut();
    setStep("done");
    window.history.replaceState(null, "", "/recuperar-senha");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#151515] p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <BrandLogo priority />
        <h1 className="mt-5 text-2xl font-bold">{step === "new" ? "Crie uma nova senha" : "Recuperar senha"}</h1>
        {step === "email" && <>
          <p className="mt-2 text-sm text-zinc-600">Informe o e-mail da sua conta para receber um link de recuperação.</p>
          <form onSubmit={sendEmail} className="mt-6 space-y-4">
            <Input aria-label="E-mail" name="email" type="email" autoComplete="email" required placeholder="Seu e-mail" className="h-11" />
            <Button disabled={loading} className="h-11 w-full bg-[#c99f3d] hover:bg-[#b88b2f]">{loading ? "Enviando..." : "Enviar link de recuperação"}</Button>
          </form>
        </>}
        {step === "sent" && <p className="mt-4 text-sm text-zinc-600">Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também a caixa de spam.</p>}
        {step === "checking" && <p className="mt-4 text-sm text-zinc-600">Verificando o link...</p>}
        {step === "new" && <form onSubmit={updatePassword} className="mt-6 space-y-4">
          <Input aria-label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="Nova senha (mínimo de 8 caracteres)" className="h-11" />
          <Input aria-label="Confirmar nova senha" name="confirmation" type="password" autoComplete="new-password" minLength={8} required placeholder="Confirme a nova senha" className="h-11" />
          <Button disabled={loading} className="h-11 w-full bg-[#c99f3d] hover:bg-[#b88b2f]">{loading ? "Salvando..." : "Salvar nova senha"}</Button>
        </form>}
        {step === "done" && <p className="mt-4 text-sm text-zinc-600">Sua senha foi alterada. Entre com a nova senha para continuar.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <a href="/login" className="mt-6 block text-center text-sm font-semibold text-[#805d19] hover:underline">Voltar ao login</a>
      </section>
    </main>
  );
}
