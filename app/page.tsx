"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Clock3,
  Copy,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerPlans } from "@/components/customer-plans";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";

type Status =
  | "Confirmado"
  | "Aguardando"
  | "Em atendimento"
  | "Finalizado"
  | "Cancelado";
type Appointment = {
  id: number;
  date: string;
  time: string;
  duration: number;
  client: string;
  phone: string;
  service: string;
  barber: string;
  price: number;
  status: Status;
  membershipId?: string;
  planName?: string;
  serviceId?: number;
};
type Client = {
  id: number;
  name: string;
  phone: string;
  lastVisit: string;
  visits: number;
  spent: number;
};
type Service = {
  id: number;
  name: string;
  duration: number;
  price: number;
  active: boolean;
};
type Barber = {
  id: number;
  name: string;
  phone: string;
  commission: number;
  active: boolean;
};
type Expense = { id: number; description: string; value: number; date: string };
type Subscription = {
  id: string;
  status:
    | "trialing"
    | "pending"
    | "active"
    | "past_due"
    | "canceled"
    | "expired";
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};
type Store = {
  appointments: Appointment[];
  clients: Client[];
  services: Service[];
  barbers: Barber[];
  expenses: Expense[];
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopSlug: string;
  onboarded: boolean;
  bookingStart: string;
  bookingEnd: string;
  bookingInterval: number;
  serviceDayRules: Record<string, number[]>;
};

const today = new Date().toISOString().slice(0, 10);
const seed: Store = {
  shopName: "",
  shopPhone: "",
  shopAddress: "",
  shopSlug: "",
  onboarded: false,
  bookingStart: "08:00",
  bookingEnd: "18:00",
  bookingInterval: 60,
  serviceDayRules: {},
  appointments: [],
  clients: [],
  services: [],
  barbers: [],
  expenses: [],
};
const nav = [
  [LayoutDashboard, "Visão geral"],
  [CalendarDays, "Agenda"],
  [Clock3, "Agendamento online"],
  [Users, "Clientes"],
  [CreditCard, "Planos de clientes"],
  [Scissors, "Serviços"],
  [UserRound, "Equipe"],
  [CircleDollarSign, "Financeiro"],
  [BarChart3, "Relatórios"],
  [Settings, "Configurações"],
] as const;
const statusColors: Record<Status, string> = {
  Confirmado: "bg-emerald-50 text-emerald-700",
  "Em atendimento": "bg-blue-50 text-blue-700",
  Aguardando: "bg-amber-50 text-amber-700",
  Finalizado: "bg-zinc-900 text-white",
  Cancelado: "bg-red-50 text-red-700",
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function initials(name: string) {
  return name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [store, setStore] = useState<Store>(seed);
  const sync = useRef<{
    version: string;
    saved: Store;
    latest: Store;
    running: boolean;
  }>({ version: "", saved: seed, latest: seed, running: false });
  sync.current.latest = store;
  const [ready, setReady] = useState(false);
  const [shopId, setShopId] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [active, setActive] = useState("Visão geral");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<
    "appointment" | "client" | "service" | "barber" | "expense" | null
  >(null);
  const [search, setSearch] = useState("");
  const [barberFilter, setBarberFilter] = useState("Todos");
  const [agendaDate, setAgendaDate] = useState(today);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data, error } = await supabase
        .from("barbershops")
        .select("id,name,phone,address,slug,payload,updated_at")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) {
        flash("Não foi possível carregar sua barbearia");
        return;
      }
      if (!data) {
        router.replace("/configurar");
        return;
      }
      setShopId(data.id);
      const { data: plan } = await supabase
        .from("subscriptions")
        .select("id,status,trial_ends_at,current_period_ends_at")
        .eq("barbershop_id", data.id)
        .maybeSingle();
      setSubscription(plan as Subscription | null);
      const loaded: Store = {
        ...seed,
        ...(data.payload || {}),
        shopName: data.name,
        shopPhone: data.phone,
        shopAddress: data.address,
        shopSlug: data.slug,
        onboarded: true,
      };
      sync.current.version = data.updated_at;
      sync.current.saved = loaded;
      sync.current.latest = loaded;
      setStore(loaded);
      setReady(true);
      const result = new URLSearchParams(window.location.search).get("plano");
      if (result) {
        setActive("Configurações");
        flash(
          result === "sucesso"
            ? "Pagamento enviado. A confirmação será atualizada automaticamente"
            : result === "cancelado"
              ? "Pagamento cancelado"
              : "O link de pagamento expirou",
        );
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, [router]);
  useEffect(() => {
    if (!ready || !shopId) return;
    async function flush() {
      const state = sync.current;
      if (state.running || state.latest === state.saved) return;
      state.running = true;
      try {
        while (state.latest !== state.saved) {
          const snapshot = state.latest;
          const { data, error } = await supabase.rpc("save_barbershop_state", {
            p_shop: shopId,
            p_payload: snapshot,
            p_version: state.version,
          });
          if (error || data?.conflict) {
            const { data: fresh } = await supabase
              .from("barbershops")
              .select("payload,updated_at,name,phone,address,slug")
              .eq("id", shopId)
              .single();
            if (fresh) {
              const loaded = {
                ...seed,
                ...fresh.payload,
                shopName: fresh.name,
                shopPhone: fresh.phone,
                shopAddress: fresh.address,
                shopSlug: fresh.slug,
              } as Store;
              state.version = fresh.updated_at;
              state.saved = loaded;
              state.latest = loaded;
              setStore(loaded);
            } else {
              state.saved = snapshot;
            }
            flash(
              error
                ? `Não foi possível salvar: ${error.message}`
                : "A agenda recebeu alterações. Confira os dados atualizados e repita sua alteração.",
            );
            break;
          }
          state.version = data.version;
          state.saved = snapshot;
        }
      } finally {
        state.running = false;
      }
    }
    const timer = setTimeout(() => {
      void flush();
    }, 450);
    return () => clearTimeout(timer);
  }, [store, ready, shopId]);
  useEffect(() => {
    if (!ready || !shopId) return;
    const timer = setInterval(async () => {
      const state = sync.current;
      if (state.running || state.latest !== state.saved) return;
      const { data } = await supabase
        .from("barbershops")
        .select("payload,updated_at,name,phone,address,slug")
        .eq("id", shopId)
        .single();
      if (
        !data ||
        data.updated_at === state.version ||
        state.running ||
        state.latest !== state.saved
      )
        return;
      const loaded = {
        ...seed,
        ...data.payload,
        shopName: data.name,
        shopPhone: data.phone,
        shopAddress: data.address,
        shopSlug: data.slug,
      } as Store;
      state.version = data.updated_at;
      state.saved = loaded;
      state.latest = loaded;
      setStore(loaded);
    }, 15000);
    return () => clearInterval(timer);
  }, [ready, shopId]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, opts?: unknown) => void;
        };
      }
    ).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    ctx.registerTool(
      {
        name: "list_today_appointments",
        title: "Listar agenda de hoje",
        description: "Retorna os atendimentos visíveis na agenda de hoje.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () =>
          store.appointments
            .filter((a) => a.date === today)
            .map(({ time, client, service, barber, status }) => ({
              time,
              client,
              service,
              barber,
              status,
            })),
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [store.appointments]);

  const appts = store.appointments.filter(
    (a) => a.date === today && a.status !== "Cancelado",
  );
  const revenue = appts
    .filter((a) => a.status !== "Aguardando")
    .reduce((s, a) => s + a.price, 0);
  const expenses = store.expenses.reduce((s, e) => s + e.value, 0);
  const finished = appts.filter((a) => a.status === "Finalizado").length;
  const filtered = store.appointments
    .filter((a) => a.date === agendaDate)
    .filter(
      (a) =>
        (barberFilter === "Todos" || a.barber === barberFilter) &&
        (a.client + a.service).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const title = active;
  const isLocked =
    !!subscription &&
    ["past_due", "expired", "canceled"].includes(subscription.status);
  function flash(message: string) {
    setNotice(message);
  }
  function remove<
    K extends "appointments" | "clients" | "services" | "barbers" | "expenses",
  >(key: K, id: number) {
    setStore((s) => ({
      ...s,
      [key]: s[key].filter((x: { id: number }) => x.id !== id),
    }));
    flash("Registro removido");
  }
  function changeStatus(id: number, status: Status) {
    setStore((s) => ({
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === id ? { ...a, status } : a,
      ),
    }));
    flash("Status atualizado");
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget),
      id = Date.now();
    if (modal === "appointment") {
      const service = store.services.find((x) => x.name === d.get("service"))!;
      const a: Appointment = {
        id,
        date: String(d.get("date")),
        time: String(d.get("time")),
        duration: service.duration,
        client: String(d.get("name")),
        phone: String(d.get("phone")),
        service: service.name,
        barber: String(d.get("barber")),
        price: service.price,
        status: "Confirmado",
      };
      setStore((s) => ({
        ...s,
        appointments: [...s.appointments, a],
        clients: s.clients.some((c) => c.phone === a.phone)
          ? s.clients
          : [
              ...s.clients,
              {
                id: id + 1,
                name: a.client,
                phone: a.phone,
                lastVisit: a.date,
                visits: 0,
                spent: 0,
              },
            ],
      }));
    }
    if (modal === "client")
      setStore((s) => ({
        ...s,
        clients: [
          ...s.clients,
          {
            id,
            name: String(d.get("name")),
            phone: String(d.get("phone")),
            lastVisit: "—",
            visits: 0,
            spent: 0,
          },
        ],
      }));
    if (modal === "service")
      setStore((s) => ({
        ...s,
        services: [
          ...s.services,
          {
            id,
            name: String(d.get("name")),
            duration: Number(d.get("duration")),
            price: Number(d.get("price")),
            active: true,
          },
        ],
      }));
    if (modal === "barber")
      setStore((s) => ({
        ...s,
        barbers: [
          ...s.barbers,
          {
            id,
            name: String(d.get("name")),
            phone: String(d.get("phone")),
            commission: Number(d.get("commission")),
            active: true,
          },
        ],
      }));
    if (modal === "expense")
      setStore((s) => ({
        ...s,
        expenses: [
          ...s.expenses,
          {
            id,
            description: String(d.get("description")),
            value: Number(d.get("value")),
            date: String(d.get("date")),
          },
        ],
      }));
    setModal(null);
    flash("Registro salvo com sucesso");
  }
  const action =
    active === "Agenda"
      ? ["Novo agendamento", "appointment"]
      : active === "Clientes"
        ? ["Novo cliente", "client"]
        : active === "Serviços"
          ? ["Novo serviço", "service"]
          : active === "Equipe"
            ? ["Novo profissional", "barber"]
            : active === "Financeiro"
              ? ["Nova despesa", "expense"]
              : null;

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#1b1d20]">
      {notice && (
        <div className="fixed right-5 top-5 z-[80] flex items-center gap-2 rounded-xl bg-[#17191d] px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <Check className="size-4 text-[#d6a53a]" />
          {notice}
        </div>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] border-r border-white/10 bg-[#17191d] text-white transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
          <BrandLogo className="h-12 w-[72px] shrink-0" priority />
          <div>
            <p className="text-sm font-bold tracking-tight">Vou de Barber</p>
            <p className="text-xs text-zinc-400">Gestão inteligente</p>
          </div>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setMobileNav(false)}
          >
            <X />
          </button>
        </div>
        <nav className="space-y-1 p-4">
          <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[.16em] text-zinc-500">
            Menu principal
          </p>
          {nav.map(([Icon, label]) => (
            <button
              key={label}
              onClick={() => {
                setActive(label);
                setMobileNav(false);
                setSearch("");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${active === label ? "bg-[#d6a53a] text-[#17191d]" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
            >
              <Icon className="size-[18px]" />
              {label}
              {label === "Agenda" && (
                <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
                  {appts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4 rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-[#d6a53a] font-bold text-[#17191d]">
              VB
            </div>
            <div>
              <p className="text-sm font-semibold">
                {store.shopName || "Proprietário"}
              </p>
              <p className="text-xs text-zinc-500">Administrador</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center border-b border-zinc-200 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
          <button
            onClick={() => setMobileNav(true)}
            className="mr-3 rounded-lg p-2 lg:hidden"
          >
            <Menu />
          </button>
          <div>
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="hidden text-xs text-zinc-500 sm:block">
              {store.shopName}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {["Agenda", "Clientes"].includes(active) && (
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 bg-zinc-50 pl-9"
                  placeholder="Buscar..."
                />
              </div>
            )}
            {action && (
              <Button
                onClick={() => setModal(action[1] as typeof modal)}
                className="h-10 rounded-xl bg-[#d6a53a] font-semibold text-[#17191d] hover:bg-[#c99a32]"
              >
                <Plus />
                {action[0]}
              </Button>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-7">
          {active === "Visão geral" && (
            <Dashboard
              appointments={appts}
              revenue={revenue}
              expenses={expenses}
              finished={finished}
              setActive={setActive}
            />
          )}
          {active === "Agenda" && (
            <Agenda
              items={filtered}
              date={agendaDate}
              setDate={setAgendaDate}
              search={search}
              setSearch={setSearch}
              filter={barberFilter}
              setFilter={setBarberFilter}
              barbers={store.barbers}
              changeStatus={changeStatus}
              remove={(id) => remove("appointments", id)}
            />
          )}
          {active === "Agendamento online" && (
            <BookingSettings store={store} setStore={setStore} flash={flash} />
          )}
          {active === "Clientes" && (
            <Clients
              items={store.clients.filter((c) =>
                (c.name + c.phone).toLowerCase().includes(search.toLowerCase()),
              )}
              remove={(id) => remove("clients", id)}
              onSchedule={(c) => {
                setModal("appointment");
                setSearch(c.name);
              }}
            />
          )}
          {active === "Planos de clientes" && (
            <CustomerPlans shopId={shopId} services={store.services} />
          )}
          {active === "Serviços" && (
            <Services
              items={store.services}
              setStore={setStore}
              remove={(id) => remove("services", id)}
            />
          )}
          {active === "Equipe" && (
            <Team
              items={store.barbers}
              appointments={appts}
              setStore={setStore}
              remove={(id) => remove("barbers", id)}
            />
          )}
          {active === "Financeiro" && (
            <Finance
              revenue={revenue}
              expenses={store.expenses}
              appointments={appts}
              remove={(id) => remove("expenses", id)}
            />
          )}
          {active === "Relatórios" && (
            <Reports
              appointments={store.appointments}
              barbers={store.barbers}
            />
          )}
          {active === "Configurações" && (
            <SettingsPage
              store={store}
              setStore={setStore}
              flash={flash}
              subscription={subscription}
              setSubscription={setSubscription}
            />
          )}
          {isLocked && active !== "Configurações" && (
            <div className="fixed inset-0 z-20 grid place-items-center bg-[#f3f4f6]/95 px-5 pt-[76px] lg:left-[248px]">
              <section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-xl">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-[#9a6a14]">
                  <CreditCard />
                </div>
                <h2 className="mt-5 text-2xl font-bold">
                  Regularize seu plano
                </h2>
                <p className="mt-2 text-zinc-500">
                  Seu acesso está temporariamente limitado. Atualize a
                  assinatura para voltar a usar todas as funções.
                </p>
                <Button
                  onClick={() => setActive("Configurações")}
                  className="mt-6 h-11 bg-[#17191d]"
                >
                  Ver meu plano
                </Button>
              </section>
            </div>
          )}
        </div>
      </main>
      <Dialog open={ready && !store.onboarded}>
        <DialogContent
          showCloseButton={false}
          className="rounded-3xl sm:max-w-[520px]"
        >
          <DialogHeader>
            <BrandLogo className="mb-2 h-24 w-36" />
            <DialogTitle className="text-2xl">
              Configure sua barbearia
            </DialogTitle>
            <DialogDescription>
              Esses dados aparecerão no seu painel, no link de agendamento e nas
              confirmações pelo WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setStore((s) => ({
                ...s,
                shopName: String(d.get("shopName")),
                shopPhone: String(d.get("shopPhone")),
                shopAddress: String(d.get("shopAddress")),
                onboarded: true,
              }));
              flash("Barbearia configurada");
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium">
              Nome da barbearia
              <Input
                name="shopName"
                required
                placeholder="Ex.: Barbearia do Matheus"
                className="mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium">
              WhatsApp da barbearia
              <Input
                name="shopPhone"
                required
                placeholder="(27) 99799-0084"
                className="mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium">
              Cidade ou endereço
              <Input
                name="shopAddress"
                required
                placeholder="Serra, Espírito Santo"
                className="mt-1.5"
              />
            </label>
            <Button className="h-11 w-full bg-[#d6a53a] font-bold text-[#17191d] hover:bg-[#c99a32]">
              Criar minha barbearia
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <EntryDialog
        kind={modal}
        close={() => setModal(null)}
        add={add}
        store={store}
        prefill={search}
      />
    </div>
  );
}

function Cards({
  items,
}: {
  items: Array<[string, string, string, typeof CalendarDays]>;
}) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value, note, Icon]) => (
        <section key={label} className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-500">{label}</p>
            <div className="grid size-9 place-items-center rounded-xl bg-amber-50 text-[#b57c13]">
              <Icon className="size-[18px]" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-zinc-400">{note}</p>
        </section>
      ))}
    </div>
  );
}
function Dashboard({
  appointments,
  revenue,
  expenses,
  finished,
  setActive,
}: {
  appointments: Appointment[];
  revenue: number;
  expenses: number;
  finished: number;
  setActive: (x: string) => void;
}) {
  return (
    <>
      <Cards
        items={[
          [
            "Agendamentos",
            String(appointments.length),
            "programados hoje",
            CalendarDays,
          ],
          [
            "Receita prevista",
            money(revenue),
            "atendimentos confirmados",
            CircleDollarSign,
          ],
          [
            "Concluídos",
            String(finished),
            `${appointments.length - finished} pendentes`,
            Clock3,
          ],
          [
            "Saldo do dia",
            money(revenue - expenses),
            `${money(expenses)} em despesas`,
            Sparkles,
          ],
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border bg-white">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="font-bold">Próximos atendimentos</h2>
              <p className="text-sm text-zinc-500">Movimento de hoje</p>
            </div>
            <Button variant="outline" onClick={() => setActive("Agenda")}>
              Ver agenda
            </Button>
          </div>
          <div className="divide-y">
            {appointments.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-4 p-4">
                <div className="grid size-11 place-items-center rounded-xl bg-zinc-100 font-bold">
                  {a.time}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.client}</p>
                  <p className="text-sm text-zinc-500">
                    {a.service} · {a.barber}
                  </p>
                </div>
                <span
                  className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:block ${statusColors[a.status]}`}
                >
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-[#17191d] p-6 text-white">
          <p className="text-sm text-zinc-400">Ocupação diária</p>
          <p className="mt-2 text-4xl font-bold text-[#d6a53a]">
            {Math.round((appointments.length / 12) * 100)}%
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#d6a53a]"
              style={{
                width: `${Math.min((appointments.length / 12) * 100, 100)}%`,
              }}
            />
          </div>
          <p className="mt-5 text-sm leading-6 text-zinc-400">
            Você tem {Math.max(12 - appointments.length, 0)} horários
            disponíveis considerando uma meta de 12 atendimentos por dia.
          </p>
        </section>
      </div>
    </>
  );
}
function Agenda({
  date,
  setDate,
  items,
  search,
  setSearch,
  filter,
  setFilter,
  barbers,
  changeStatus,
  remove,
}: {
  date: string;
  setDate: (x: string) => void;
  items: Appointment[];
  search: string;
  setSearch: (x: string) => void;
  filter: string;
  setFilter: (x: string) => void;
  barbers: Barber[];
  changeStatus: (id: number, s: Status) => void;
  remove: (id: number) => void;
}) {
  function shiftDate(offset: number) {
    const next = new Date(`${date || today}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    setDate(next.toISOString().slice(0, 10));
  }
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b p-5">
        <div className="mr-auto flex items-center gap-2">
          <button aria-label="Dia anterior" onClick={() => shiftDate(-1)} className="rounded-lg border p-2">
            <ChevronLeft className="size-4" />
          </button>
          <button aria-label="Próximo dia" onClick={() => shiftDate(1)} className="rounded-lg border p-2">
            <ChevronRight className="size-4" />
          </button>
          <div className="ml-2">
            <h2 className="font-bold">Agenda</h2>
            <label className="mt-2 block text-xs text-zinc-500">
              Data dos atendimentos
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-40"
              />
            </label>
            <p className="text-xs text-zinc-500">
              {items.length} atendimentos encontrados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {["Todos", ...barbers.filter((b) => b.active).map((b) => b.name)].map(
            (b) => (
              <button
                key={b}
                onClick={() => setFilter(b)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === b ? "bg-[#17191d] text-white" : "bg-zinc-100"}`}
              >
                {b}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="p-4 md:hidden">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente ou serviço"
        />
      </div>
      <div className="divide-y">
        {items.map((a) => (
          <article
            key={a.id}
            className="grid grid-cols-[64px_1fr_auto] items-center gap-3 p-4 sm:grid-cols-[70px_1.3fr_1fr_130px_150px_70px]"
          >
            <div>
              <p className="font-bold">{a.time}</p>
              <p className="text-xs text-zinc-400">{a.duration} min</p>
            </div>
            <div>
              <p className="font-semibold">{a.client}</p>
              <p className="text-xs text-zinc-500">{a.phone}</p>
              {a.planName && (
                <p className="mt-1 text-xs font-semibold text-[#997015]">
                  Plano: {a.planName}
                </p>
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium">{a.service}</p>
              <p className="text-xs text-zinc-400">
                {a.planName ? `Incluído · ${a.planName}` : money(a.price)}
              </p>
            </div>
            <p className="hidden text-sm sm:block">{a.barber}</p>
            <select
              value={a.status}
              onChange={(e) => changeStatus(a.id, e.target.value as Status)}
              aria-label={`Status de ${a.client}`}
              className={`col-start-2 rounded-lg border-0 px-2 py-2 text-xs font-semibold sm:col-start-auto ${statusColors[a.status]}`}
            >
              {[
                "Aguardando",
                "Confirmado",
                "Em atendimento",
                "Finalizado",
                "Cancelado",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => remove(a.id)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </article>
        ))}
        {!items.length && <Empty text="Nenhum agendamento encontrado" />}
      </div>
    </section>
  );
}
function Clients({
  items,
  remove,
  onSchedule,
}: {
  items: Client[];
  remove: (id: number) => void;
  onSchedule: (c: Client) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="grid grid-cols-[1.5fr_1fr_100px_120px_90px] gap-4 border-b bg-zinc-50 px-5 py-3 text-xs font-semibold uppercase text-zinc-500 max-sm:hidden">
        <span>Cliente</span>
        <span>Última visita</span>
        <span>Visitas</span>
        <span>Total gasto</span>
        <span></span>
      </div>
      {items.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-4 border-b p-5 sm:grid sm:grid-cols-[1.5fr_1fr_100px_120px_90px]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">
              {initials(c.name)}
            </div>
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-zinc-500">{c.phone}</p>
            </div>
          </div>
          <p className="hidden text-sm sm:block">{c.lastVisit}</p>
          <p className="hidden text-sm sm:block">{c.visits}</p>
          <p className="hidden font-semibold sm:block">{money(c.spent)}</p>
          <div className="ml-auto flex">
            <button
              onClick={() => onSchedule(c)}
              className="rounded-lg p-2 text-[#9a6a14] hover:bg-amber-50"
              title="Agendar"
            >
              <CalendarDays className="size-4" />
            </button>
            <button
              onClick={() => remove(c.id)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}
      {!items.length && <Empty text="Nenhum cliente encontrado" />}
    </section>
  );
}
function Services({
  items,
  setStore,
  remove,
}: {
  items: Service[];
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  remove: (id: number) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((s) => (
        <section
          key={s.id}
          className={`rounded-2xl border bg-white p-5 ${!s.active ? "opacity-55" : ""}`}
        >
          <div className="flex items-start justify-between">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-[#b57c13]">
              <Scissors className="size-5" />
            </div>
            <button
              onClick={() => remove(s.id)}
              className="p-2 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <h3 className="mt-4 font-bold">{s.name}</h3>
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
            <span>{s.duration} minutos</span>
            <strong className="text-lg text-zinc-900">{money(s.price)}</strong>
          </div>
          <button
            onClick={() =>
              setStore((st) => ({
                ...st,
                services: st.services.map((x) =>
                  x.id === s.id ? { ...x, active: !x.active } : x,
                ),
              }))
            }
            className="mt-4 w-full rounded-lg border py-2 text-sm font-semibold"
          >
            {s.active ? "Desativar" : "Ativar serviço"}
          </button>
        </section>
      ))}
    </div>
  );
}
function BookingSettings({
  store,
  setStore,
  flash,
}: {
  store: Store;
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  flash: (x: string) => void;
}) {
  const [date, setDate] = useState(today);
  const selected =
    store.serviceDayRules[date] ??
    store.services.filter((s) => s.active).map((s) => s.id);
  function toggle(id: number) {
    const service = store.services.find((s) => s.id === id);
    if (!service?.active) {
      flash("Ative primeiro este serviço na seção Serviços");
      return;
    }
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    setStore((s) => ({
      ...s,
      serviceDayRules: { ...s.serviceDayRules, [date]: next },
    }));
    flash("Disponibilidade atualizada");
  }
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5">
        <div>
          <h2 className="font-bold">Página de agendamento</h2>
          <p className="text-sm text-zinc-500">
            Confira como serviços e horários aparecem para o cliente.
          </p>
        </div>
        <Button
          onClick={() =>
            window.open(`/agendar?barbearia=${store.shopSlug}`, "_blank")
          }
          className="bg-[#17191d]"
        >
          Visualizar agendamento
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="font-bold">Horários disponíveis</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Defina a faixa de horários exibida aos clientes.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              Início
              <Input
                type="time"
                value={store.bookingStart}
                onChange={(e) =>
                  setStore((s) => ({ ...s, bookingStart: e.target.value }))
                }
                className="mt-2"
              />
            </label>
            <label className="text-sm font-medium">
              Término
              <Input
                type="time"
                value={store.bookingEnd}
                onChange={(e) =>
                  setStore((s) => ({ ...s, bookingEnd: e.target.value }))
                }
                className="mt-2"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Intervalo entre horários
            <select
              value={store.bookingInterval}
              onChange={(e) =>
                setStore((s) => ({
                  ...s,
                  bookingInterval: Number(e.target.value),
                }))
              }
              className="mt-2 h-10 w-full rounded-md border bg-white px-3"
            >
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="45">45 minutos</option>
              <option value="60">60 minutos</option>
            </select>
          </label>
          {store.bookingStart > store.bookingEnd && (
            <p className="mt-3 text-sm font-medium text-red-600">
              O horário final precisa ser depois do horário inicial.
            </p>
          )}
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            As alterações são salvas automaticamente na conta da sua barbearia.
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="font-bold">Serviços disponíveis por dia</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Escolha uma data e deixe ativos apenas os serviços que deseja
            oferecer.
          </p>
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-5 max-w-xs"
          />
          <div className="mt-5 space-y-3">
            {store.services.map((service) => (
              <button
                key={service.id}
                onClick={() => toggle(service.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${!service.active ? "cursor-not-allowed bg-zinc-50 opacity-45" : selected.includes(service.id) ? "border-emerald-200 bg-emerald-50" : "bg-zinc-50 opacity-65"}`}
              >
                <div>
                  <p className="font-semibold">{service.name}</p>
                  <p className="text-sm text-zinc-500">
                    {service.duration} min · {money(service.price)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${service.active && selected.includes(service.id) ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-600"}`}
                >
                  {!service.active
                    ? "Inativo no catálogo"
                    : selected.includes(service.id)
                      ? "Ativo no dia"
                      : "Desativado"}
                </span>
              </button>
            ))}
            {!store.services.length && (
              <Empty text="Cadastre os serviços antes de configurar a disponibilidade" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
function Team({
  items,
  appointments,
  setStore,
  remove,
}: {
  items: Barber[];
  appointments: Appointment[];
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  remove: (id: number) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((b) => {
        const jobs = appointments.filter((a) => a.barber === b.name);
        const total = jobs.reduce((s, a) => s + a.price, 0);
        return (
          <section
            key={b.id}
            className={`rounded-2xl border bg-white p-5 ${!b.active ? "opacity-55" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-[#17191d] font-bold text-[#d6a53a]">
                {initials(b.name)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{b.name}</h3>
                <p className="text-sm text-zinc-500">{b.phone}</p>
              </div>
              <button
                onClick={() => remove(b.id)}
                className="p-2 text-zinc-400 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="font-bold">{jobs.length}</p>
                <p className="text-[11px] text-zinc-500">Hoje</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="font-bold">{b.commission}%</p>
                <p className="text-[11px] text-zinc-500">Comissão</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="font-bold">
                  {money((total * b.commission) / 100)}
                </p>
                <p className="text-[11px] text-zinc-500">A receber</p>
              </div>
            </div>
            <button
              onClick={() =>
                setStore((st) => ({
                  ...st,
                  barbers: st.barbers.map((x) =>
                    x.id === b.id ? { ...x, active: !x.active } : x,
                  ),
                }))
              }
              className="mt-4 w-full rounded-lg border py-2 text-sm font-semibold"
            >
              {b.active ? "Desativar profissional" : "Reativar profissional"}
            </button>
          </section>
        );
      })}
    </div>
  );
}
function Finance({
  revenue,
  expenses,
  appointments,
  remove,
}: {
  revenue: number;
  expenses: Expense[];
  appointments: Appointment[];
  remove: (id: number) => void;
}) {
  const out = expenses.reduce((s, e) => s + e.value, 0);
  return (
    <>
      <Cards
        items={[
          ["Entradas", money(revenue), "receita prevista", CircleDollarSign],
          ["Despesas", money(out), `${expenses.length} lançamentos`, BarChart3],
          ["Saldo", money(revenue - out), "resultado do dia", Sparkles],
          [
            "Ticket médio",
            money(appointments.length ? revenue / appointments.length : 0),
            "por atendimento",
            Users,
          ],
        ]}
      />
      <section className="rounded-2xl border bg-white">
        <div className="border-b p-5">
          <h2 className="font-bold">Movimentações</h2>
        </div>
        {appointments
          .filter((a) => a.status !== "Aguardando")
          .map((a) => (
            <div key={a.id} className="flex items-center gap-4 border-b p-4">
              <div className="grid size-10 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                +
              </div>
              <div className="flex-1">
                <p className="font-semibold">{a.service}</p>
                <p className="text-sm text-zinc-500">
                  {a.client} · {a.barber}
                </p>
              </div>
              <strong className="text-emerald-700">+ {money(a.price)}</strong>
            </div>
          ))}
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center gap-4 border-b p-4">
            <div className="grid size-10 place-items-center rounded-full bg-red-50 text-red-700">
              −
            </div>
            <div className="flex-1">
              <p className="font-semibold">{e.description}</p>
              <p className="text-sm text-zinc-500">{e.date}</p>
            </div>
            <strong className="text-red-700">− {money(e.value)}</strong>
            <button
              onClick={() => remove(e.id)}
              className="p-2 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
function Reports({
  appointments,
  barbers,
}: {
  appointments: Appointment[];
  barbers: Barber[];
}) {
  const valid = appointments.filter((a) => a.status !== "Cancelado"),
    total = valid.reduce((s, a) => s + a.price, 0);
  return (
    <>
      <Cards
        items={[
          [
            "Faturamento total",
            money(total),
            "período completo",
            CircleDollarSign,
          ],
          ["Atendimentos", String(valid.length), "registrados", CalendarDays],
          [
            "Clientes únicos",
            String(new Set(valid.map((a) => a.phone)).size),
            "identificados",
            Users,
          ],
          [
            "Cancelamentos",
            String(appointments.filter((a) => a.status === "Cancelado").length),
            "no período",
            BarChart3,
          ],
        ]}
      />
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-bold">Desempenho por profissional</h2>
        <div className="mt-5 space-y-5">
          {barbers.map((b) => {
            const own = valid.filter((a) => a.barber === b.name),
              value = own.reduce((s, a) => s + a.price, 0),
              pct = total ? (value / total) * 100 : 0;
            return (
              <div key={b.id}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold">
                    {b.name} · {own.length} atendimentos
                  </span>
                  <strong>{money(value)}</strong>
                </div>
                <div className="h-2 rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-[#d6a53a]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
function SettingsPage({
  store,
  setStore,
  flash,
  subscription,
  setSubscription,
}: {
  store: Store;
  setStore: React.Dispatch<React.SetStateAction<Store>>;
  flash: (x: string) => void;
  subscription: Subscription | null;
  setSubscription: React.Dispatch<React.SetStateAction<Subscription | null>>;
}) {
  const [name, setName] = useState(store.shopName);
  const [phone, setPhone] = useState(store.shopPhone);
  const [address, setAddress] = useState(store.shopAddress);
  const bookingPath = `/agendar?barbearia=${store.shopSlug}`;
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const statusLabel: Record<string, string> = {
    trialing: "Período grátis",
    pending: "Pagamento pendente",
    active: "Ativo",
    past_due: "Pagamento atrasado",
    canceled: "Cancelado",
    expired: "Expirado",
  };
  const planDate =
    subscription?.status === "trialing"
      ? subscription.trial_ends_at
      : subscription?.current_period_ends_at;

  async function startCheckout() {
    setCheckoutLoading(true);
    const { data, error } = await supabase.functions.invoke("asaas-checkout", {
      body: {},
    });
    setCheckoutLoading(false);
    if (error || !data?.checkoutUrl) {
      let message = data?.error || "Pagamento ainda não está disponível";
      const context = (error as { context?: Response } | null)?.context;
      if (context) {
        const body = await context
          .clone()
          .json()
          .catch(() => null);
        if (body?.error) message = body.error;
      }
      flash(message);
      return;
    }
    setSubscription((current) =>
      current ? { ...current, status: "pending" } : current,
    );
    window.location.href = data.checkoutUrl;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="overflow-hidden rounded-2xl bg-[#17191d] p-6 text-white lg:col-span-2">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#d6a53a]/15 px-3 py-1 text-sm font-semibold text-[#e8bd5d]">
                {subscription
                  ? statusLabel[subscription.status]
                  : "Carregando plano"}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">Plano Profissional</h2>
            <p className="mt-1 text-zinc-400">
              Agenda online, clientes, serviços, equipe, financeiro e
              relatórios.
            </p>
            {planDate && (
              <p className="mt-4 text-sm text-zinc-300">
                {subscription?.status === "trialing"
                  ? "Teste grátis até "
                  : "Próxima renovação em "}
                <strong>
                  {new Date(planDate).toLocaleDateString("pt-BR")}
                </strong>
              </p>
            )}
          </div>
          <div className="md:text-right">
            <p>
              <span className="text-3xl font-bold text-[#d6a53a]">
                R$ 39,90
              </span>
              <span className="text-zinc-400">/mês</span>
            </p>
            {subscription?.status !== "active" && (
              <Button
                onClick={startCheckout}
                disabled={checkoutLoading || !subscription}
                className="mt-4 h-11 bg-[#d6a53a] font-bold text-[#17191d] hover:bg-[#c99a32]"
              >
                <CreditCard className="size-4" />
                {checkoutLoading
                  ? "Abrindo pagamento..."
                  : subscription?.status === "pending"
                    ? "Continuar pagamento"
                    : "Assinar agora"}
              </Button>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Pagamento seguro processado pelo Asaas
            </p>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 lg:col-span-2">
        <h2 className="font-bold">Link público de agendamento</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Envie este link aos clientes. Eles podem agendar sem entrar na sua
          conta.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input readOnly value={bookingPath} className="h-11 bg-white" />
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(
                `${window.location.origin}${bookingPath}`,
              );
              flash("Link de agendamento copiado");
            }}
            className="h-11 shrink-0 bg-[#17191d]"
          >
            <Copy className="size-4" /> Copiar link
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(bookingPath, "_blank")}
            className="h-11 shrink-0 bg-white"
          >
            Abrir página
          </Button>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="font-bold">Dados da barbearia</h2>
        <label className="mt-5 block text-sm font-medium">
          Nome da empresa
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Telefone
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Endereço
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-2"
          />
        </label>
        <Button
          onClick={() => {
            setStore((s) => ({
              ...s,
              shopName: name,
              shopPhone: phone,
              shopAddress: address,
            }));
            flash("Configurações salvas");
          }}
          className="mt-5 bg-[#17191d]"
        >
          Salvar alterações
        </Button>
      </section>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="font-bold">Dados e segurança</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Seus registros são salvos automaticamente na sua conta. Você pode
          exportar uma cópia de segurança ou restaurar os dados iniciais.
        </p>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(store, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "vou-de-barber-backup.json";
            a.click();
            URL.revokeObjectURL(url);
            flash("Backup gerado");
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"
        >
          <Copy className="size-4" />
          Exportar backup
        </button>
        <button
          onClick={() => {
            if (confirm("Limpar todos os dados cadastrados?")) {
              setStore((s) => ({
                ...s,
                appointments: [],
                clients: [],
                services: [],
                barbers: [],
                expenses: [],
              }));
              flash("Dados restaurados");
            }
          }}
          className="mt-3 w-full rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600"
        >
          Limpar dados
        </button>
        <div className="my-5 border-t" />
        <button
          onClick={async () => {
            if (!confirm("Deseja realmente sair da sua conta?")) return;
            const { error } = await supabase.auth.signOut();
            if (error) {
              flash("Não foi possível sair. Tente novamente");
              return;
            }
            window.location.replace("/login");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17191d] py-3 text-sm font-semibold text-white hover:bg-black"
        >
          <LogOut className="size-4" />
          Sair da conta
        </button>
      </section>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-14 text-center">
      <p className="font-semibold">{text}</p>
      <p className="mt-1 text-sm text-zinc-500">
        Use o botão no topo para adicionar um novo registro.
      </p>
    </div>
  );
}
function EntryDialog({
  kind,
  close,
  add,
  store,
  prefill,
}: {
  kind: string | null;
  close: () => void;
  add: (e: FormEvent<HTMLFormElement>) => void;
  store: Store;
  prefill: string;
}) {
  const titles: Record<string, string> = {
    appointment: "Novo agendamento",
    client: "Novo cliente",
    service: "Novo serviço",
    barber: "Novo profissional",
    expense: "Nova despesa",
  };
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && close()}>
      <DialogContent className="rounded-2xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : "Novo registro"}</DialogTitle>
          <DialogDescription>
            Preencha os campos para salvar no sistema.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={add} className="space-y-4">
          {["appointment", "client", "service", "barber"].includes(
            kind || "",
          ) && (
            <label className="block text-sm font-medium">
              Nome
              <Input
                name="name"
                required
                defaultValue={kind === "appointment" ? prefill : ""}
                className="mt-1.5"
              />
            </label>
          )}
          {["appointment", "client", "barber"].includes(kind || "") && (
            <label className="block text-sm font-medium">
              Telefone
              <Input
                name="phone"
                required
                placeholder="(27) 99999-9999"
                className="mt-1.5"
              />
            </label>
          )}
          {kind === "appointment" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  Data
                  <Input
                    name="date"
                    type="date"
                    required
                    defaultValue={today}
                    className="mt-1.5"
                  />
                </label>
                <label className="text-sm font-medium">
                  Horário
                  <Input
                    name="time"
                    type="time"
                    required
                    defaultValue="14:00"
                    className="mt-1.5"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Serviço
                <select
                  name="service"
                  className="mt-1.5 h-10 w-full rounded-md border bg-white px-3"
                >
                  {store.services
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id}>{s.name}</option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Profissional
                <select
                  name="barber"
                  className="mt-1.5 h-10 w-full rounded-md border bg-white px-3"
                >
                  {store.barbers
                    .filter((b) => b.active)
                    .map((b) => (
                      <option key={b.id}>{b.name}</option>
                    ))}
                </select>
              </label>
            </>
          )}
          {kind === "service" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Duração (min)
                <Input
                  name="duration"
                  type="number"
                  required
                  defaultValue="40"
                  className="mt-1.5"
                />
              </label>
              <label className="text-sm font-medium">
                Preço
                <Input
                  name="price"
                  type="number"
                  required
                  defaultValue="45"
                  className="mt-1.5"
                />
              </label>
            </div>
          )}
          {kind === "barber" && (
            <label className="block text-sm font-medium">
              Comissão (%)
              <Input
                name="commission"
                type="number"
                required
                defaultValue="40"
                className="mt-1.5"
              />
            </label>
          )}
          {kind === "expense" && (
            <>
              <label className="block text-sm font-medium">
                Descrição
                <Input name="description" required className="mt-1.5" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  Valor
                  <Input
                    name="value"
                    type="number"
                    required
                    className="mt-1.5"
                  />
                </label>
                <label className="text-sm font-medium">
                  Data
                  <Input
                    name="date"
                    type="date"
                    required
                    defaultValue={today}
                    className="mt-1.5"
                  />
                </label>
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-[#17191d]">
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
