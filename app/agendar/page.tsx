"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  Scissors,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicPlan } from "@/components/customer-plans";
import { supabase } from "@/lib/supabase";

type Service = {
  id: number;
  name: string;
  duration: number;
  price: number;
  active: boolean;
};
type Barber = { id: number; name: string; active: boolean };
type Appointment = {
  date: string;
  time: string;
  barber: string;
  status: string;
};
type Data = {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  slug: string;
  services: Service[];
  barbers: Barber[];
  appointments: Appointment[];
  bookingStart: string;
  bookingEnd: string;
  bookingInterval: number;
  serviceDayRules: Record<string, number[]>;
};

const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const defaults = {
  services: [],
  barbers: [],
  appointments: [],
  bookingStart: "08:00",
  bookingEnd: "18:00",
  bookingInterval: 60,
  serviceDayRules: {},
};

function buildTimes(start: string, end: string, interval: number) {
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const first = toMinutes(start),
    last = toMinutes(end),
    step = Math.max(interval, 15),
    result: string[] = [];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last)
    return result;
  for (let value = first; value <= last; value += step)
    result.push(
      `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`,
    );
  return result;
}

export default function Agendar() {
  const [data, setData] = useState<Data | null>(null),
    [selectedService, setService] = useState<Service | null>(null),
    [barber, setBarber] = useState(""),
    [date, setDate] = useState(localDate),
    [time, setTime] = useState(""),
    [done, setDone] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);

  const [cpf, setCpf] = useState(""),
    [pin, setPin] = useState(""),
    [plan, setPlan] = useState<PublicPlan | null>(null);
  const [checking, setChecking] = useState(false),
    [planError, setPlanError] = useState(""),
    [usePlan, setUsePlan] = useState(true);
  const [bookedPlan, setBookedPlan] = useState("");
  const lookupRequest = useRef(0);
  function credentials(value: string, field: "cpf" | "pin") {
    lookupRequest.current += 1;
    setChecking(false);
    setPlan(null);
    setPlanError("");
    if (field === "cpf") setCpf(value.replace(/\D/g, "").slice(0, 11));
    else setPin(value.replace(/\D/g, "").slice(0, 6));
  }
  async function lookup() {
    if (!data || checking) return;
    const request = ++lookupRequest.current;
    setChecking(true);
    setPlanError("");
    const { data: result, error } = await supabase.rpc("lookup_customer_plan", {
      p_slug: data.slug,
      p_cpf: cpf,
      p_pin: pin,
    });
    if (request !== lookupRequest.current) return;
    setChecking(false);
    if (error || result?.error || !result?.id) {
      setPlan(null);
      setPlanError(
        result?.error || "Não foi possível consultar o plano. Tente novamente.",
      );
    } else {
      setPlan(result as PublicPlan);
      setUsePlan(true);
    }
  }

  useEffect(() => {
    (async () => {
      let slug = new URLSearchParams(window.location.search).get("barbearia");
      if (!slug) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: ownShop } = await supabase
            .from("barbershops")
            .select("slug")
            .eq("owner_id", user.id)
            .maybeSingle();
          slug = ownShop?.slug || null;
        }
      }
      if (!slug) {
        setError("Este link de agendamento está incompleto.");
        return;
      }
      const { data: shop, error } = await supabase.rpc(
        "get_public_barbershop",
        { p_slug: slug },
      );
      if (error || !shop) {
        setError("Barbearia não encontrada ou agenda indisponível.");
        return;
      }
      const loaded = { ...defaults, ...shop } as Data;
      window.history.replaceState(
        null,
        "",
        `/agendar?barbearia=${encodeURIComponent(slug)}`,
      );
      setData(loaded);
      setBarber(loaded.barbers.find((b) => b.active)?.name || "");
    })();
  }, []);

  const services = useMemo(() => {
    if (!data) return [];
    const global = data.services.filter((s) => s.active);
    const rule = data.serviceDayRules?.[date];
    return rule === undefined
      ? global
      : global.filter((s) => rule.includes(s.id));
  }, [data, date]);
  const service =
    services.find((s) => s.id === selectedService?.id) || services[0] || null;
  const selectedBenefit = plan?.benefits.find(
    (b) => b.serviceId === service?.id,
  );
  const remaining = selectedBenefit
    ? Math.max(
        0,
        selectedBenefit.quantity -
          selectedBenefit.reserved -
          selectedBenefit.consumed,
      )
    : 0;
  const covered = !!(
    plan &&
    usePlan &&
    remaining > 0 &&
    date >= plan.startsOn &&
    date <= plan.expiresOn
  );

  const times = useMemo(
    () =>
      buildTimes(
        data?.bookingStart || "08:00",
        data?.bookingEnd || "18:00",
        data?.bookingInterval || 60,
      ),
    [data],
  );
  const available = useMemo(
    () =>
      times.filter(
        (t) =>
          !data?.appointments.some(
            (a) =>
              a.date === date &&
              a.time === t &&
              a.barber === barber &&
              a.status !== "Cancelado",
          ),
      ),
    [times, data, date, barber],
  );
  const phone = (data?.shopPhone || "").replace(/\D/g, "");
  const whatsapp = phone ? (phone.startsWith("55") ? phone : `55${phone}`) : "";
  const message = encodeURIComponent(
    `Olá! Acabei de solicitar um agendamento na ${data?.shopName || "barbearia"}.\n\n👤 Cliente: ${name}\n✂️ Serviço: ${service?.name}\n💈 Profissional: ${barber}\n📅 Data: ${date.split("-").reverse().join("/")}\n🕐 Horário: ${time}\n💰 Valor: ${bookedPlan ? `Incluído no plano ${bookedPlan}` : service ? money(service.price) : ""}\n\nAguardo a confirmação do meu horário.`,
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setError("");
    if (!data || !service || !barber || !time) {
      setError("Escolha o serviço, o profissional e o horário.");
      return;
    }
    const f = new FormData(e.currentTarget),
      client = String(f.get("name")),
      clientPhone = String(f.get("phone"));
    setSaving(true);
    const { data: result, error: saveError } = await supabase.rpc(
      covered ? "create_plan_booking" : "create_public_booking",
      {
        ...(covered ? { p_cpf: cpf, p_pin: pin } : {}),
        p_slug: data.slug,
        p_client_name: client,
        p_client_phone: clientPhone,
        p_service_id: service.id,
        p_barber: barber,
        p_date: date,
        p_time: time,
      },
    );
    setSaving(false);
    if (saveError || result?.error) {
      setError(
        result?.error ||
          saveError?.message ||
          "Não foi possível salvar o agendamento. Tente novamente.",
      );
      const { data: fresh } = await supabase.rpc("get_public_barbershop", {
        p_slug: data.slug,
      });
      if (fresh) setData({ ...defaults, ...fresh } as Data);
      setTime("");
      return;
    }
    setBookedPlan(covered ? result?.planName || plan?.planName || "" : "");
    setName(client);
    setDone(true);
  }

  if (done)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f2ee] p-5">
        <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white text-center shadow-[0_24px_80px_-40px_rgba(22,24,27,.35)]">
          <div className="bg-[#1a1c1e] px-7 pb-9 pt-10 text-white">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#d6a53a] text-[#1a1c1e]">
              <Check className="size-8" />
            </div>
            <h1 className="mt-5 text-2xl font-bold">Pedido enviado!</h1>
            <p className="mt-2 text-sm text-zinc-300">
              {data?.shopName} recebeu sua solicitação de agendamento.
            </p>
          </div>
          <div className="p-7">
            <div className="rounded-2xl border border-zinc-200 bg-[#faf9f6] p-5 text-left">
              <p className="text-sm font-semibold text-zinc-500">
                Sua solicitação
              </p>
              <p className="mt-2 text-lg font-bold text-[#1a1c1e]">
                {service?.name}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {date.split("-").reverse().join("/")} às {time} · {barber}
              </p>
            </div>
            {bookedPlan && (
              <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                1 crédito reservado no plano <b>{bookedPlan}</b>. Ele será
                utilizado ao finalizar o atendimento.
              </p>
            )}
            {whatsapp && (
              <>
                <a
                  href={`https://wa.me/${whatsapp}?text=${message}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16894c] px-4 font-bold text-white hover:bg-[#137740]"
                >
                  <MessageCircle className="size-5" />
                  Confirmar pelo WhatsApp
                </a>
                <p className="mt-3 text-sm text-zinc-500">
                  A mensagem abrirá pronta. Basta tocar em enviar.
                </p>
              </>
            )}
            <p className="mt-5 text-sm text-zinc-500">
              Aguarde a confirmação da barbearia.
            </p>
          </div>
        </section>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f3f2ee] text-[#202124]">
      <header className="bg-[#1a1c1e] text-white">
        <div className="mx-auto max-w-5xl px-5 pb-9 pt-6 sm:px-8 sm:pb-12 sm:pt-9">
          <div className="flex items-center gap-3 border-b border-white/10 pb-6">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#d6a53a] text-[#1a1c1e]">
              <Scissors className="size-5" />
            </div>
            <p className="min-w-0 truncate text-base font-bold sm:text-lg">
              {data?.shopName || "Vou de Barber"}
            </p>
            <span className="ml-auto hidden text-sm text-zinc-400 sm:block">
              Agendamento online
            </span>
          </div>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[.18em] text-[#e0b857]">
            Reserve seu horário
          </p>
          <h1 className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Seu próximo atendimento começa aqui.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-300">
            Escolha um serviço, selecione o melhor horário e envie seu pedido à
            barbearia.
          </p>
          {(data?.shopAddress || data?.shopPhone) && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-300">
              {data.shopAddress && (
                <span className="flex items-center gap-2">
                  <MapPin className="size-4 text-[#e0b857]" />
                  {data.shopAddress}
                </span>
              )}
              {data.shopPhone && <span>{data.shopPhone}</span>}
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
        {error && !data ? (
          <section
            className="rounded-3xl bg-white p-8 text-center text-red-700 shadow-sm"
            role="alert"
          >
            {error}
          </section>
        ) : !data ? (
          <section className="rounded-3xl bg-white p-8 text-center text-zinc-600 shadow-sm">
            Carregando horários disponíveis...
          </section>
        ) : (
          <form
            onSubmit={submit}
            className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_290px]"
          >
            <div className="space-y-5">
              <section className="rounded-[1.75rem] border border-[#e9e7e1] bg-white p-5 sm:p-7">
                <h2 className="text-lg font-bold">
                  Já tem um plano nesta barbearia?
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Consulte com seu CPF e o código de 6 números fornecido pela
                  barbearia. Não precisa entrar em uma conta.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    CPF
                    <Input
                      value={cpf}
                      onChange={(e) => credentials(e.target.value, "cpf")}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Somente números"
                      className="mt-2 h-12"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Código do plano
                    <Input
                      value={pin}
                      onChange={(e) => credentials(e.target.value, "pin")}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="6 números"
                      className="mt-2 h-12"
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  disabled={checking || cpf.length !== 11 || pin.length !== 6}
                  onClick={() => void lookup()}
                >
                  {checking ? "Consultando..." : "Consultar meu plano"}
                </Button>
                {planError && (
                  <p role="alert" className="mt-3 text-sm text-red-700">
                    {planError}
                  </p>
                )}
                {plan && (
                  <div className="mt-4 rounded-2xl bg-[#fff9e9] p-4">
                    <h3 className="font-bold">{plan.planName}</h3>
                    <p className="mt-1 text-xs text-zinc-600">
                      Válido de {plan.startsOn.split("-").reverse().join("/")}{" "}
                      até {plan.expiresOn.split("-").reverse().join("/")}
                    </p>
                    <div className="mt-3 space-y-2">
                      {plan.benefits.map((b) => (
                        <div
                          key={b.serviceId}
                          className="rounded-lg bg-white p-3 text-sm"
                        >
                          <b>
                            {b.serviceName}:{" "}
                            {Math.max(0, b.quantity - b.reserved - b.consumed)}{" "}
                            disponíveis
                          </b>
                          <p className="mt-1 text-xs text-zinc-500">
                            {b.consumed} utilizados · {b.reserved} reservados ·{" "}
                            {b.quantity} contratados
                          </p>
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={usePlan}
                        onChange={(e) => setUsePlan(e.target.checked)}
                      />
                      Usar meu saldo neste agendamento
                    </label>
                  </div>
                )}
              </section>
              <Box
                number="01"
                title="Escolha o serviço"
                description="Selecione o atendimento que você deseja."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => {
                        setService(s);
                        setTime("");
                      }}
                      aria-pressed={service?.id === s.id}
                      className={`group min-h-24 rounded-2xl border-2 p-4 text-left transition-colors ${service?.id === s.id ? "border-[#c99730] bg-[#fff9e9]" : "border-[#eeece6] bg-white hover:border-[#d6a53a]"}`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <b className="text-base">{s.name}</b>
                        {service?.id === s.id && (
                          <Check className="size-5 shrink-0 text-[#ad7818]" />
                        )}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
                        <span className="flex items-center gap-1">
                          <Clock3 className="size-4" />
                          {s.duration} min
                        </span>
                        <strong className="text-[#202124]">
                          {money(s.price)}
                        </strong>
                      </span>
                    </button>
                  ))}
                  {data && !services.length && (
                    <p className="col-span-full rounded-xl bg-[#f7f6f2] p-5 text-sm text-zinc-600">
                      Nenhum serviço disponível nesta data.
                    </p>
                  )}
                </div>
              </Box>
              <Box
                number="02"
                title="Profissional e data"
                description="Escolha quem vai atender você e em qual dia."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-zinc-700">
                    <span className="flex items-center gap-2">
                      <UserRound className="size-4" />
                      Profissional
                    </span>
                    <select
                      aria-label="Escolha o profissional"
                      value={barber}
                      onChange={(e) => {
                        setBarber(e.target.value);
                        setTime("");
                      }}
                      className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base"
                    >
                      <option value="" disabled>
                        Escolha o profissional
                      </option>
                      {data?.barbers
                        .filter((b) => b.active)
                        .map((b) => (
                          <option key={b.id}>{b.name}</option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-semibold text-zinc-700">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-4" />
                      Data
                    </span>
                    <Input
                      aria-label="Data do agendamento"
                      type="date"
                      min={localDate()}
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setTime("");
                      }}
                      className="h-12 text-base"
                    />
                  </label>
                </div>
              </Box>
              <Box
                number="03"
                title="Escolha o horário"
                description="Horários disponíveis para o dia selecionado."
              >
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {available.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setTime(t)}
                      aria-pressed={time === t}
                      className={`min-h-12 rounded-xl border-2 px-2 py-3 text-base font-semibold transition-colors ${time === t ? "border-[#1a1c1e] bg-[#1a1c1e] text-white" : "border-[#eeece6] bg-white hover:border-[#d6a53a]"}`}
                    >
                      {t}
                    </button>
                  ))}
                  {data && !available.length && (
                    <p className="col-span-full rounded-xl bg-[#f7f6f2] p-5 text-sm text-zinc-600">
                      Nenhum horário disponível nesta data.
                    </p>
                  )}
                </div>
              </Box>
              <Box
                number="04"
                title="Seus dados"
                description="Para a barbearia identificar e confirmar seu pedido."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-semibold text-zinc-700">
                    Nome completo
                    <Input
                      name="name"
                      required
                      autoComplete="name"
                      placeholder="Nome completo"
                      className="h-12 text-base"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-semibold text-zinc-700">
                    WhatsApp
                    <Input
                      name="phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      placeholder="WhatsApp"
                      className="h-12 text-base"
                    />
                  </label>
                </div>
                {plan && usePlan && (
                  <p
                    className={`mt-4 rounded-xl p-3 text-sm ${covered ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                  >
                    {covered
                      ? `1 crédito será reservado no plano ${plan.planName}. Sem cobrança adicional deste serviço.`
                      : "Este serviço ou data não tem crédito disponível. O agendamento será avulso, pelo valor mostrado no resumo."}
                  </p>
                )}
                {plan && usePlan && !covered && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      key={`${service?.id}-${date}`}
                      type="checkbox"
                      required
                      className="mt-1"
                    />
                    Concordo em agendar este atendimento avulso por{" "}
                    {service ? money(service.price) : "—"}.
                  </label>
                )}
                {error && (
                  <p role="alert" className="mt-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <Button
                  disabled={!service || !barber || !time || saving}
                  className="mt-5 h-14 w-full bg-[#d6a53a] text-base font-bold text-[#17191d] hover:bg-[#c99a32]"
                >
                  {saving ? "Enviando pedido..." : "Solicitar agendamento"}
                </Button>
                <p className="mt-3 text-center text-sm text-zinc-500">
                  O horário será confirmado pela barbearia.
                </p>
              </Box>
            </div>
            <aside
              className="rounded-[1.75rem] bg-[#1a1c1e] p-6 text-white shadow-lg lg:sticky lg:top-6"
              aria-label="Resumo do agendamento"
            >
              <p className="text-sm font-semibold uppercase tracking-[.14em] text-[#e0b857]">
                Seu agendamento
              </p>
              <h2 className="mt-2 text-xl font-bold">Confira seu pedido</h2>
              <div className="mt-6 space-y-5 border-y border-white/15 py-5 text-sm">
                <div>
                  <p className="text-zinc-400">Serviço</p>
                  <p className="mt-1 text-base font-semibold">
                    {service?.name || "Escolha um serviço"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Profissional</p>
                  <p className="mt-1 text-base font-semibold">
                    {barber || "Escolha um profissional"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Data e horário</p>
                  <p className="mt-1 text-base font-semibold">
                    {date.split("-").reverse().join("/")}
                    {time ? ` às ${time}` : " · escolha um horário"}
                  </p>
                </div>
              </div>
              {covered && (
                <p className="mt-4 text-sm text-zinc-300">
                  {plan?.planName} · 1 crédito reservado ao agendar
                </p>
              )}
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">Valor do serviço</span>
                <strong className="text-xl text-[#e0b857]">
                  {covered
                    ? "Incluído no plano"
                    : service
                      ? money(service.price)
                      : "—"}
                </strong>
              </div>
            </aside>
          </form>
        )}
        <p className="mt-10 text-center text-sm text-zinc-500">
          Agendamento por Vou de Barber
        </p>
      </div>
    </main>
  );
}

function Box({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[#e9e7e1] bg-white p-5 shadow-[0_12px_32px_-25px_rgba(22,24,27,.2)] sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6e9c9] text-sm font-bold text-[#76500c]">
          {number}
        </span>
        <div>
          <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
