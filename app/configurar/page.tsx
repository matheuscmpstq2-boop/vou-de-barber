"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  KeyRound,
  MailCheck,
  Scissors,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const digits = (value: string) => value.replace(/\D/g, "");

function validCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (size: number) => {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(cpf[size]);
  };
  return check(9) && check(10);
}

function validCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((total, n, i) => total + Number(n) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calc(
    cnpj.slice(0, 12) + first,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj.endsWith(`${first}${second}`);
}

export default function Configurar() {
  const [uid, setUid] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [confirmationSent, setConfirmationSent] = useState(false),
    [resendMessage, setResendMessage] = useState(""),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [ownerName, setOwnerName] = useState(""),
    [birthDate, setBirthDate] = useState(""),
    [ownerCpf, setOwnerCpf] = useState(""),
    [ownerPhone, setOwnerPhone] = useState("");
  const [documentType, setDocumentType] = useState<"CPF" | "CNPJ">("CNPJ"),
    [businessDocument, setBusinessDocument] = useState("");
  const maxBirthDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUid(data.user.id);
        setEmail(data.user.email || "");
        setStep(1);
      } else if (new URLSearchParams(location.search).get("novo") !== "1")
        location.href = "/login";
    });
  }, []);

  async function createAccess() {
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (password.length < 8) {
      setError("Crie uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/configurar` },
    });
    setLoading(false);
    if (signUpError) {
      setError(
        signUpError.message.includes("already")
          ? "Este e-mail já possui uma conta."
          : signUpError.message,
      );
      return;
    }
    if (!data.session || !data.user) {
      setConfirmationSent(true);
      return;
    }
    setUid(data.user.id);
    setStep(1);
  }

  async function resendConfirmation(){
    setLoading(true);setResendMessage("");
    const{error:resendError}=await supabase.auth.resend({type:"signup",email,options:{emailRedirectTo:`${window.location.origin}/configurar`}});
    setLoading(false);
    setResendMessage(resendError?"Não foi possível reenviar agora. Aguarde um minuto e tente novamente.":"Novo e-mail enviado. Verifique também Spam e Promoções.");
  }

  function next() {
    setError("");
    if (ownerName.trim().split(/\s+/).length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!birthDate || birthDate > maxBirthDate) {
      setError("O responsável precisa ter pelo menos 18 anos.");
      return;
    }
    if (!validCpf(ownerCpf)) {
      setError("Informe um CPF válido para o responsável.");
      return;
    }
    if (digits(ownerPhone).length < 10) {
      setError("Informe um telefone válido para o responsável.");
      return;
    }
    setStep(2);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (
      documentType === "CPF"
        ? !validCpf(businessDocument)
        : !validCnpj(businessDocument)
    ) {
      setError(`Informe um ${documentType} válido.`);
      return;
    }
    const d = new FormData(e.currentTarget),
      name = String(d.get("name")).trim(),
      phone = String(d.get("phone")).trim();
    if (digits(phone).length < 10) {
      setError("Informe um WhatsApp válido para a barbearia.");
      return;
    }
    const slug =
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      uid.slice(0, 6);
    const address = [
      d.get("address"),
      d.get("number"),
      d.get("neighborhood"),
      d.get("city"),
      d.get("state"),
    ]
      .filter(Boolean)
      .join(", ");
    setLoading(true);
    const payload = {
      ownerFullName: ownerName.trim(),
      ownerBirthDate: birthDate,
      ownerCpf: digits(ownerCpf),
      ownerPhone: ownerPhone.trim(),
      businessDocumentType: documentType,
      businessDocument: digits(businessDocument),
      postalCode: digits(String(d.get("postalCode"))),
      addressNumber: String(d.get("number")),
      neighborhood: String(d.get("neighborhood")),
      city: String(d.get("city")),
      state: String(d.get("state")),
    };
    const { error: saveError } = await supabase
      .from("barbershops")
      .insert({ owner_id: uid, name, phone, address, slug, payload });
    setLoading(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[#f3f4f6] p-4 sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl lg:grid-cols-[340px_1fr]">
        <aside className="bg-[#17191d] p-7 text-white sm:p-9">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#d6a53a] text-[#17191d]">
            <Scissors />
          </div>
          <h1 className="mt-7 text-2xl font-bold">Prepare sua barbearia</h1>
          <p className="mt-2 leading-6 text-zinc-400">
            Complete os dados para criar seu painel e liberar o link de
            agendamento.
          </p>
          <div className="mt-8 space-y-4">
            <Step
              active={step === 0}
              done={step > 0}
              icon={KeyRound}
              number="1"
              title="Acesso"
              text="E-mail e senha"
            />
            <Step
              active={step === 1}
              done={step > 1}
              icon={UserRound}
              number="2"
              title="Responsável"
              text="Dados pessoais e contato"
            />
            <Step
              active={step === 2}
              done={false}
              icon={Building2}
              number="3"
              title="Barbearia"
              text="Dados comerciais e endereço"
            />
          </div>
          <div className="mt-8 flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#d6a53a]" />
            <p>
              Seus documentos ficam protegidos e não aparecem para os clientes.
            </p>
          </div>
        </aside>
        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8">
            <p className="text-sm font-semibold text-[#9a6a14]">
              Etapa {step + 1} de 3
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              {step === 0
                ? "Crie seu acesso"
                : step === 1
                  ? "Dados do responsável"
                  : "Dados da barbearia"}
            </h2>
            <p className="mt-1 text-zinc-500">
              {step === 0
                ? "Comece com o e-mail e a senha que usará para entrar no sistema."
                : step === 1
                  ? "Informe quem será o administrador principal da conta."
                  : "Essas informações serão usadas no painel e nos agendamentos."}
            </p>
          </div>
          {step === 0 ? (
            confirmationSent ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-9">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-600 text-white">
                  <MailCheck />
                </div>
                <h3 className="mt-5 text-xl font-bold">Confirme seu e-mail</h3>
                <p className="mx-auto mt-2 max-w-md leading-6 text-zinc-600">
                  Enviamos o link de confirmação para <strong>{email}</strong>.
                  Depois de confirmar, você voltará para concluir o cadastro.
                </p>
                <div className="mt-5 rounded-xl bg-white p-4 text-left text-sm text-zinc-600">
                  Não encontrou? Verifique as pastas <strong>Spam</strong>,
                  <strong> Lixeira</strong> e <strong>Promoções</strong> do Gmail.
                </div>
                {resendMessage && <p className="mt-4 text-sm font-medium text-zinc-700">{resendMessage}</p>}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button onClick={resendConfirmation} disabled={loading} className="h-11 bg-[#17191d]">
                    {loading ? "Reenviando..." : "Reenviar e-mail"}
                  </Button>
                  <Button variant="outline" onClick={() => location.href="/login"} className="h-11 bg-white">
                    Voltar para o login
                  </Button>
                </div>
              </div>
            ) : (
            <div className="space-y-5">
              <Field label="E-mail">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@exemplo.com"
                  className="mt-2 h-12"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Crie uma senha">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="Confirme a senha">
                  <Input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Digite novamente"
                    className="mt-2 h-12"
                  />
                </Field>
              </div>
              {error && <ErrorText text={error} />}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (location.href = "/login")}
                  className="h-12"
                >
                  Já tenho conta
                </Button>
                <Button
                  onClick={createAccess}
                  disabled={loading}
                  className="h-12 bg-[#17191d] px-7 font-bold"
                >
                  {loading ? "Criando acesso..." : "Continuar"}
                  {!loading && <ArrowRight className="size-4" />}
                </Button>
              </div>
            </div>
            )
          ) : step === 1 ? (
            <div className="space-y-5">
              <Field label="Nome completo">
                <Input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  autoComplete="name"
                  placeholder="Nome e sobrenome"
                  className="mt-2 h-12"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Data de nascimento">
                  <Input
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    type="date"
                    max={maxBirthDate}
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="CPF do responsável">
                  <Input
                    value={ownerCpf}
                    onChange={(e) => setOwnerCpf(e.target.value)}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    className="mt-2 h-12"
                  />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Telefone do responsável">
                  <Input
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="(27) 99999-9999"
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="E-mail da conta">
                  <Input
                    value={email}
                    readOnly
                    className="mt-2 h-12 bg-zinc-50"
                  />
                </Field>
              </div>
              {error && <ErrorText text={error} />}
              <Button
                onClick={next}
                className="h-12 w-full bg-[#17191d] font-bold sm:w-auto sm:min-w-52"
              >
                Continuar <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome da barbearia">
                  <Input
                    name="name"
                    required
                    placeholder="Nome que aparecerá aos clientes"
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="WhatsApp da barbearia">
                  <Input
                    name="phone"
                    required
                    inputMode="tel"
                    placeholder="(27) 99999-9999"
                    className="mt-2 h-12"
                  />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-[150px_1fr]">
                <Field label="Tipo de documento">
                  <select
                    value={documentType}
                    onChange={(e) => {
                      setDocumentType(e.target.value as "CPF" | "CNPJ");
                      setBusinessDocument("");
                    }}
                    className="mt-2 h-12 w-full rounded-md border bg-white px-3"
                  >
                    <option>CPF</option>
                    <option>CNPJ</option>
                  </select>
                </Field>
                <Field label={`${documentType} da barbearia`}>
                  <Input
                    value={businessDocument}
                    onChange={(e) => setBusinessDocument(e.target.value)}
                    required
                    inputMode="numeric"
                    placeholder={
                      documentType === "CPF"
                        ? "000.000.000-00"
                        : "00.000.000/0000-00"
                    }
                    className="mt-2 h-12"
                  />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-[160px_1fr_120px]">
                <Field label="CEP">
                  <Input
                    name="postalCode"
                    required
                    inputMode="numeric"
                    placeholder="00000-000"
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="Rua ou avenida">
                  <Input
                    name="address"
                    required
                    placeholder="Nome da rua"
                    className="mt-2 h-12"
                  />
                </Field>
                <Field label="Número">
                  <Input
                    name="number"
                    required
                    placeholder="123"
                    className="mt-2 h-12"
                  />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Bairro">
                  <Input name="neighborhood" required className="mt-2 h-12" />
                </Field>
                <Field label="Cidade">
                  <Input name="city" required className="mt-2 h-12" />
                </Field>
                <Field label="UF">
                  <Input
                    name="state"
                    required
                    maxLength={2}
                    placeholder="ES"
                    className="mt-2 h-12 uppercase"
                  />
                </Field>
              </div>
              <label className="flex items-start gap-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  required
                  className="mt-1 size-4 accent-[#17191d]"
                />
                <span>
                  Confirmo que os dados informados são verdadeiros e autorizo
                  seu uso para a gestão da conta.
                </span>
              </label>
              {error && <ErrorText text={error} />}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                  className="h-12"
                >
                  <ArrowLeft className="size-4" />
                  Voltar
                </Button>
                <Button
                  disabled={!uid || loading}
                  className="h-12 bg-[#d6a53a] px-7 font-bold text-[#17191d] hover:bg-[#c99a32]"
                >
                  {loading ? "Criando sua barbearia..." : "Concluir cadastro"}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-zinc-700">
      {label}
      {children}
    </label>
  );
}
function ErrorText({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
      {text}
    </p>
  );
}
function Step({
  active,
  done,
  icon: Icon,
  number,
  title,
  text,
}: {
  active: boolean;
  done: boolean;
  icon: typeof UserRound;
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl p-3 ${active ? "bg-white/10" : ""}`}
    >
      <div
        className={`grid size-10 place-items-center rounded-xl ${active || done ? "bg-[#d6a53a] text-[#17191d]" : "bg-white/10 text-zinc-500"}`}
      >
        {done ? "✓" : <Icon className="size-5" />}
      </div>
      <div>
        <p
          className={`font-semibold ${active || done ? "text-white" : "text-zinc-500"}`}
        >
          {number}. {title}
        </p>
        <p className="text-xs text-zinc-500">{text}</p>
      </div>
    </div>
  );
}
