"use client";

import { FormEvent, useState } from "react";
import { Scissors } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const d = new FormData(e.currentTarget);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: String(d.get("email")),
      password: String(d.get("password")),
    });
    setLoading(false);
    if (loginError) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    location.href = "/";
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#17191d] p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="grid size-12 place-items-center rounded-2xl bg-[#d6a53a]">
          <Scissors />
        </div>
        <h1 className="mt-5 text-2xl font-bold">Entre no Vou de Barber</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Acesse o painel da sua barbearia.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Seu e-mail"
            className="h-11"
          />
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Sua senha"
            className="h-11"
          />
          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button disabled={loading} className="h-11 w-full bg-[#17191d]">
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <a
          href="/recuperar-senha"
          className="mt-4 block text-center text-sm font-semibold text-[#8a5d0d] hover:underline"
        >
          Esqueci minha senha
        </a>
        <button
          onClick={() => (location.href = "/configurar?novo=1")}
          className="mt-5 w-full rounded-xl border border-amber-200 bg-amber-50 py-3 text-sm font-bold text-[#8a5d0d] hover:bg-amber-100"
        >
          Ainda não tenho conta
        </button>
      </section>
    </main>
  );
}
