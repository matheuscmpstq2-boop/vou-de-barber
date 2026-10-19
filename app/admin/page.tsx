"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type Tab = "overview" | "shops" | "users" | "payments" | "activity";
type Shop = {
  id: string;
  name: string;
  email: string;
  owner_name: string;
  phone: string;
  address: string;
  slug: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  billing_state: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  clients_count: number;
  appointments_count: number;
  asaas_subscription_id: string;
  asaas_checkout_id: string;
  note: string;
};
type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  shop_name: string | null;
  shop_id: string | null;
};
type Payment = {
  id: string;
  shop_id: string | null;
  shop_name: string | null;
  email: string | null;
  status: string;
  amount: number | null;
  billing_type: string | null;
  due_date: string | null;
  payment_date: string | null;
  invoice_url: string | null;
  event_at: string;
  processing_error: string | null;
};
type EventError = {
  event_id: string;
  event_type: string;
  processing_error: string;
  created_at: string | null;
};
type Overview = {
  generated_at: string;
  shops_total: number;
  users_total: number;
  users_active_30d: number;
  shops_active: number;
  shops_past_due: number;
  trials_active: number;
  trials_ended: number;
  checkouts_pending: number;
  trials_ending_7d: number;
  clients_total: number;
  appointments_total: number;
  received_month: number;
  overdue_amount: number;
  monthly_price: number;
  estimated_mrr: number;
  billing_states: Record<string, number>;
  webhook_errors: number;
  last_webhook_at: string | null;
  recent_webhook_errors: EventError[];
};
type Detail = {
  shop: Shop;
  payments: Payment[];
  audit: {
    action: string;
    details: Record<string, string | number | null>;
    created_at: string;
  }[];
};
type Row = Shop | User | Payment;
const tabs = [
  { id: "overview", name: "Visão geral", icon: ShieldCheck },
  { id: "shops", name: "Barbearias", icon: Building2 },
  { id: "users", name: "Usuários", icon: Users },
  { id: "payments", name: "Cobranças", icon: WalletCards },
  { id: "activity", name: "Integração e alertas", icon: Activity },
] as const;
const labels: Record<string, string> = {
  active: "Ativo",
  trialing: "Teste grátis",
  trial_ended: "Teste encerrado",
  pending: "Checkout pendente",
  past_due: "Inadimplente",
  access_expired: "Período encerrado",
  expired: "Expirado",
  canceled: "Cancelado",
  no_plan: "Sem assinatura",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  OVERDUE: "Vencido",
  PENDING: "Aguardando pagamento",
  REFUNDED: "Estornado",
  DELETED: "Excluído",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  CHARGEBACK_REQUESTED: "Chargeback solicitado",
};
const money = (v: number | null) =>
  v === null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function date(v: string | null | undefined, time = false) {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00-03:00` : v);
  return Number.isNaN(d.getTime())
    ? "—"
    : time
      ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function Badge({ status }: { status: string }) {
  const tone = ["active", "RECEIVED", "CONFIRMED"].includes(status)
    ? "bg-emerald-50 text-emerald-800"
    : ["past_due", "OVERDUE", "REFUNDED"].includes(status)
      ? "bg-red-50 text-red-800"
      : ["trialing", "pending", "PENDING"].includes(status)
        ? "bg-amber-50 text-amber-900"
        : "bg-secondary text-zinc-600";
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
    >
      {labels[status] || status}
    </span>
  );
}
function invoiceLink(raw: string | null) {
  try {
    const u = new URL(raw || "");
    return u.protocol === "https:" &&
      (u.hostname === "asaas.com" ||
        u.hostname.endsWith(".asaas.com") ||
        u.hostname === "asaas.com.br" ||
        u.hostname.endsWith(".asaas.com.br"))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function exportRows(rows: Row[], tab: Tab) {
  const fields =
    tab === "shops"
      ? [
          "name",
          "email",
          "phone",
          "billing_state",
          "trial_ends_at",
          "current_period_ends_at",
        ]
      : tab === "users"
        ? ["name", "email", "shop_name", "created_at", "last_sign_in_at"]
        : [
            "id",
            "shop_name",
            "status",
            "amount",
            "billing_type",
            "due_date",
            "payment_date",
          ];
  const cell = (v: unknown) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replaceAll('"', '""')}"`;
  };
  const csv = [
    fields,
    ...rows.map((r) =>
      fields.map((f) => (r as unknown as Record<string, unknown>)[f]),
    ),
  ]
    .map((row) => row.map(cell).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `vou-de-barber-${tab}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PlatformAdmin() {
  const [screen, setScreen] = useState<
    "loading" | "ready" | "login" | "denied" | "error"
  >("loading");
  const [tab, setTab] = useState<Tab>("overview"),
    [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(0),
    detailRequest = useRef(0);
  const [authRetry, setAuthRetry] = useState(0);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        setScreen(
          authError && authError.name !== "AuthSessionMissingError"
            ? "error"
            : "login",
        );
        return;
      }
      const { data: allowed, error: accessError } = await supabase.rpc(
        "platform_admin_access",
      );
      if (!mounted) return;
      setScreen(accessError ? "error" : allowed === true ? "ready" : "denied");
    })();
    return () => {
      mounted = false;
    };
  }, [authRetry]);
  useEffect(() => {
    if (screen !== "ready") return;
    let mounted = true;
    void supabase
      .rpc("platform_admin_overview")
      .then(({ data, error: failure }) => {
        if (!mounted) return;
        if (failure)
          setError(
            "Não foi possível atualizar os indicadores. Confira a conexão com o banco.",
          );
        else setOverview(data as Overview);
      });
    return () => {
      mounted = false;
    };
  }, [screen, refresh]);
  useEffect(() => {
    if (screen !== "ready" || tab === "overview" || tab === "activity") return;
    const ticket = ++request.current;
    const args =
      tab === "users"
        ? { p_search: query, p_page: page }
        : { p_search: query, p_status: filter, p_page: page };
    void supabase
      .rpc(`platform_admin_${tab}`, args)
      .then(({ data, error: failure }) => {
        if (ticket !== request.current) return;
        setLoading(false);
        if (failure) {
          setRows([]);
          setTotal(0);
          setError("Não foi possível carregar a lista. Tente atualizar.");
        } else {
          setRows(data.rows);
          setTotal(data.total);
        }
      });
    return () => {
      request.current += 1;
    };
  }, [screen, tab, query, filter, page, refresh]);
  function navigate(next: Tab, state = "all") {
    request.current += 1;
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearch("");
    setQuery("");
    setFilter(state);
    setTab(next);
    setRefresh((n) => n + 1);
    setLoading(next !== "overview" && next !== "activity");
    setError("");
  }
  function update() {
    setError("");
    setLoading(true);
    setRefresh((n) => n + 1);
  }
  async function openShop(id: string) {
    const ticket = ++detailRequest.current;
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    setMessage("");
    const { data, error: failure } = await supabase.rpc(
      "platform_admin_shop_detail",
      { p_shop: id },
    );
    if (ticket !== detailRequest.current) return;
    setDetailLoading(false);
    if (failure || !data)
      setDetailError("Não foi possível abrir os dados da barbearia.");
    else {
      setDetail(data as Detail);
      setNote(data.shop.note);
    }
  }
  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("platform_admin_save_note", {
      p_shop: detail.shop.id,
      p_note: note,
    });
    setBusy(false);
    if (failure) setMessage("Não foi possível salvar a observação.");
    else {
      await openShop(detail.shop.id);
      setMessage("Observação salva no histórico.");
      update();
    }
  }
  async function extend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail || busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error: failure } = await supabase.rpc(
      "platform_admin_extend_trial",
      {
        p_shop: detail.shop.id,
        p_days: Number(f.get("days")),
        p_reason: String(f.get("reason")),
      },
    );
    setBusy(false);
    if (failure) setMessage(failure.message);
    else {
      await openShop(detail.shop.id);
      setMessage(
        "Cortesia registrada. As cobranças existentes permanecem no Asaas.",
      );
      update();
    }
  }
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    location.href = "/login";
  }, []);
  if (screen !== "ready")
    return (
      <main className="grid min-h-screen place-items-center bg-[#151515] p-5">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8">
          <BrandLogo priority />
          <h1 className="mt-5 text-2xl font-bold">
            Administração da plataforma
          </h1>
          <p role="status" className="my-5 text-sm leading-6 text-zinc-600">
            {screen === "loading"
              ? "Verificando seu acesso..."
              : screen === "login"
                ? "Entre com a conta do administrador do Vou de Barber para continuar."
                : screen === "denied"
                  ? "Esta conta não tem permissão para administrar a plataforma. Os dados das demais barbearias estão protegidos."
                  : "Não foi possível verificar o acesso. O banco pode estar pausado ou a configuração administrativa ainda não foi aplicada. Nenhum dado foi carregado."}
          </p>
          {screen === "login" && (
            <a
              href="/login?next=/admin"
              className="inline-flex rounded-xl bg-[#c99f3d] px-5 py-3 font-semibold"
            >
              Entrar como administrador
            </a>
          )}
          {screen === "error" && (
            <Button
              onClick={() => {
                setScreen("loading");
                setAuthRetry((n) => n + 1);
              }}
            >
              Tentar novamente
            </Button>
          )}
          {screen === "denied" && (
            <Button onClick={() => void logout()} variant="outline">
              Sair e trocar de conta
            </Button>
          )}
          <a href="/" className="mt-5 block text-sm underline">
            Voltar ao sistema
          </a>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-[#c99f3d]/30 bg-[#151515] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-5">
          <BrandLogo className="h-12 w-[72px]" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#e4c16a]">
              Vou de Barber
            </p>
            <h1 className="text-xl font-bold">Administração da plataforma</h1>
          </div>
          <div className="ml-auto flex gap-2">
            <a
              href="/"
              className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm"
            >
              <ArrowLeft className="size-4" />
              Meu painel
            </a>
            <button
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <nav
            aria-label="Administração"
            className="flex max-w-full gap-2 overflow-x-auto pb-1"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === t.id ? "bg-[#151515] text-[#e4c16a]" : "border bg-white text-zinc-600"}`}
              >
                <t.icon className="size-4" />
                {t.name}
              </button>
            ))}
          </nav>
          <Button variant="outline" onClick={update}>
            <RefreshCw className="size-4" />
            Atualizar
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {overview && (
          <p className="mb-5 text-xs text-zinc-500">
            Dados atualizados em {date(overview.generated_at, true)} · horários
            de Brasília
          </p>
        )}
        {tab === "overview" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                title="Barbearias cadastradas"
                value={overview?.shops_total}
                icon={Building2}
              />
              <Stat
                title="Assinaturas ativas"
                value={overview?.shops_active}
                icon={ShieldCheck}
              />
              <Stat
                title="Usuários cadastrados"
                value={overview?.users_total}
                icon={Users}
              />
              <Stat
                title="Usuários com login em 30 dias"
                value={overview?.users_active_30d}
                icon={Activity}
              />
              <Stat
                title="Recebido neste mês"
                value={overview ? money(overview.received_month) : undefined}
                icon={WalletCards}
              />
              <Stat
                title="Cobranças vencidas"
                value={overview ? money(overview.overdue_amount) : undefined}
                icon={WalletCards}
              />
              <Stat
                title="Receita mensal estimada"
                value={overview ? money(overview.estimated_mrr) : undefined}
                icon={CalendarClock}
              />
              <Stat
                title="Testes encerrados"
                value={overview?.trials_ended}
                icon={CalendarClock}
              />
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl bg-[#151515] p-6 text-white">
                <h2 className="text-xl font-bold">Atenção às assinaturas</h2>
                <p className="mt-2 text-sm text-zinc-300">
                  Acompanhe cada situação sem confundir teste encerrado com
                  dívida.
                </p>
                <div className="mt-5 space-y-3">
                  {[
                    [
                      "past_due",
                      "Barbearias inadimplentes",
                      overview?.shops_past_due,
                    ],
                    [
                      "pending",
                      "Checkouts aguardando pagamento",
                      overview?.checkouts_pending,
                    ],
                    [
                      "trial_ended",
                      "Testes grátis encerrados",
                      overview?.trials_ended,
                    ],
                    [
                      "trialing",
                      "Testes grátis em andamento",
                      overview?.trials_active,
                    ],
                  ].map(([state, title, count]) => (
                    <button
                      key={String(state)}
                      onClick={() => navigate("shops", String(state))}
                      className="flex w-full items-center justify-between rounded-xl border border-white/15 p-4 text-left text-sm"
                    >
                      <span>{title}</span>
                      <b className="text-lg text-[#e4c16a]">{count ?? "—"}</b>
                    </button>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border bg-white p-6">
                <h2 className="text-xl font-bold">Uso da plataforma</h2>
                <dl className="mt-5 space-y-4 text-sm">
                  <Metric
                    title="Clientes cadastrados nas barbearias"
                    value={overview?.clients_total}
                  />
                  <Metric
                    title="Agendamentos cadastrados"
                    value={overview?.appointments_total}
                  />
                  <Metric
                    title="Testes que vencem em até 7 dias"
                    value={overview?.trials_ending_7d}
                  />
                  <Metric
                    title="Eventos com erro de processamento"
                    value={overview?.webhook_errors}
                  />
                </dl>
                <p className="mt-5 rounded-xl bg-secondary p-4 text-xs leading-5 text-zinc-600">
                  “Login em 30 dias” mede acesso recente, não pessoas online
                  agora. A receita mensal é uma estimativa de assinaturas ativas
                  ×{" "}
                  {overview ? money(overview.monthly_price) : "preço do plano"}.
                  Valores recebidos e vencidos usam os eventos de pagamento
                  disponíveis no webhook, sem somar o mesmo pagamento duas
                  vezes.
                </p>
              </section>
            </div>
          </>
        )}
        {["shops", "users", "payments"].includes(tab) && (
          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  setQuery(search.trim());
                  setLoading(true);
                  setRefresh((n) => n + 1);
                }}
                className="flex min-w-0 flex-1 gap-2"
              >
                <Input
                  aria-label="Buscar registros"
                  placeholder={
                    tab === "payments"
                      ? "Barbearia, e-mail ou ID da cobrança"
                      : "Nome da barbearia ou e-mail"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button type="submit" variant="outline">
                  <Search className="size-4" />
                  <span className="sr-only">Buscar</span>
                </Button>
              </form>
              {tab !== "users" && (
                <select
                  aria-label="Filtrar por situação"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(1);
                    setLoading(true);
                  }}
                  className="h-10 max-w-full rounded-lg border bg-white px-3 text-sm"
                >
                  <option value="all">Todas as situações</option>
                  {(tab === "shops"
                    ? [
                        "active",
                        "trialing",
                        "trial_ended",
                        "past_due",
                        "pending",
                        "access_expired",
                        "expired",
                        "canceled",
                        "no_plan",
                      ]
                    : [
                        "RECEIVED",
                        "CONFIRMED",
                        "OVERDUE",
                        "PENDING",
                        "REFUNDED",
                      ]
                  ).map((v) => (
                    <option key={v} value={v}>
                      {labels[v]}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="outline"
                disabled={!rows.length || loading}
                onClick={() => exportRows(rows, tab)}
              >
                <Download className="size-4" />
                Exportar esta página
              </Button>
            </div>
            {tab === "payments" && (
              <p className="border-b bg-secondary px-5 py-3 text-xs leading-5 text-zinc-600">
                Histórico dos pagamentos recebidos pelo webhook. Eventos de
                checkout sem cobrança identificada aparecem na situação da
                assinatura. Para conferir o extrato completo, utilize o Asaas.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-secondary text-xs uppercase text-zinc-500">
                  <tr>
                    {(tab === "shops"
                      ? [
                          "Barbearia",
                          "Proprietário",
                          "Assinatura",
                          "Validade / próximo fim",
                          "Cadastro",
                          "Detalhes",
                        ]
                      : tab === "users"
                        ? [
                            "Usuário",
                            "E-mail",
                            "Barbearia",
                            "Confirmação",
                            "Último login",
                            "Cadastro",
                          ]
                        : [
                            "Cobrança",
                            "Barbearia",
                            "Valor",
                            "Situação",
                            "Vencimento",
                            "Fatura",
                          ]
                    ).map((h) => (
                      <th key={h} className="px-5 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!loading &&
                    rows.map((r) =>
                      tab === "shops" ? (
                        <ShopRow
                          key={(r as Shop).id}
                          shop={r as Shop}
                          open={openShop}
                        />
                      ) : tab === "users" ? (
                        <UserRow key={(r as User).id} user={r as User} />
                      ) : (
                        <PaymentRow
                          key={(r as Payment).id}
                          payment={r as Payment}
                        />
                      ),
                    )}
                </tbody>
              </table>
            </div>
            {(loading || !rows.length) && (
              <p
                role="status"
                className="p-10 text-center text-sm text-zinc-500"
              >
                {loading
                  ? "Carregando registros..."
                  : "Nenhum registro encontrado para estes filtros."}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-sm">
              <span>
                {total} registros · página {page} de{" "}
                {Math.max(1, Math.ceil(total / 25))}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((n) => n - 1);
                  }}
                >
                  <ChevronLeft className="size-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 25 >= total || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((n) => n + 1);
                  }}
                >
                  Próxima
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        )}
        {tab === "activity" && (
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Integração com o Asaas</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Último evento recebido: {date(overview?.last_webhook_at, true)}
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              {overview?.webhook_errors ?? "—"} eventos registrados com erro.
              Este painel não altera pagamentos nem reenvia cobranças.
            </p>
            <div className="mt-6 space-y-3">
              {overview?.recent_webhook_errors.map((e) => (
                <article
                  key={e.event_id}
                  className="rounded-xl border border-red-200 bg-red-50 p-4"
                >
                  <b className="text-sm">{e.event_type}</b>
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {e.event_id} · {date(e.created_at, true)}
                  </p>
                  <p className="mt-2 break-words text-sm text-red-800">
                    {e.processing_error}
                  </p>
                </article>
              ))}
              {overview && !overview.recent_webhook_errors.length && (
                <p className="rounded-xl bg-secondary p-5 text-sm text-zinc-600">
                  Nenhum erro de webhook registrado.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
      <Dialog
        open={!!detail || detailLoading || !!detailError}
        onOpenChange={(open) => {
          if (!open && !busy) {
            detailRequest.current += 1;
            setDetail(null);
            setDetailLoading(false);
            setDetailError("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.shop.name || "Dados da barbearia"}
            </DialogTitle>
            <DialogDescription>
              Dados da conta, assinatura, pagamentos e histórico administrativo.
            </DialogDescription>
          </DialogHeader>
          {detailLoading && <p role="status">Carregando...</p>}
          {detailError && (
            <p role="alert" className="text-red-700">
              {detailError}
            </p>
          )}
          {detail && (
            <>
              <Badge status={detail.shop.billing_state} />
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Metric title="E-mail" value={detail.shop.email} />
                <Metric
                  title="Responsável"
                  value={detail.shop.owner_name || "—"}
                />
                <Metric title="Contato" value={detail.shop.phone || "—"} />
                <Metric
                  title="Cadastrada em"
                  value={date(detail.shop.created_at)}
                />
                <Metric
                  title="Teste grátis até"
                  value={date(detail.shop.trial_ends_at)}
                />
                <Metric
                  title="Período pago até"
                  value={date(detail.shop.current_period_ends_at)}
                />
                <Metric title="Clientes" value={detail.shop.clients_count} />
                <Metric
                  title="Agendamentos"
                  value={detail.shop.appointments_count}
                />
              </dl>
              <p className="text-xs text-zinc-500">
                Assinatura Asaas:{" "}
                {detail.shop.asaas_subscription_id || "Não vinculada"}
              </p>
              <form onSubmit={saveNote} className="space-y-2 border-t pt-4">
                <label className="text-sm font-semibold" htmlFor="admin-note">
                  Observação interna
                </label>
                <textarea
                  id="admin-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  className="w-full rounded-xl border p-3 text-sm"
                  placeholder="Anote informações do atendimento à barbearia."
                />
                <Button disabled={busy}>Salvar observação</Button>
              </form>
              {detail.shop.subscription_id &&
                detail.shop.subscription_status !== "active" && (
                  <form
                    onSubmit={extend}
                    className="space-y-3 rounded-xl bg-secondary p-4"
                  >
                    <h3 className="font-bold">Conceder dias de cortesia</h3>
                    <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
                      <label className="text-sm">
                        Dias
                        <Input
                          name="days"
                          type="number"
                          min="1"
                          max="30"
                          defaultValue="7"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        Motivo
                        <Input
                          name="reason"
                          minLength={5}
                          maxLength={500}
                          required
                          placeholder="Motivo da liberação"
                        />
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-zinc-600">
                      <input type="checkbox" required className="mt-1" />
                      Entendo que a cortesia libera acesso, mas não quita nem
                      cancela cobranças existentes no Asaas.
                    </label>
                    <Button disabled={busy}>Confirmar cortesia</Button>
                  </form>
                )}
              {message && (
                <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">
                  {message}
                </p>
              )}
              <section className="border-t pt-4">
                <h3 className="font-bold">Pagamentos desta barbearia</h3>
                <div className="mt-3 space-y-2">
                  {detail.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <b>{money(p.amount)}</b>
                        <p className="text-xs text-zinc-500">
                          Vencimento: {date(p.due_date)}
                        </p>
                      </div>
                      <Badge status={p.status} />
                    </div>
                  ))}
                  {!detail.payments.length && (
                    <p className="text-sm text-zinc-500">
                      Nenhuma cobrança identificada nos eventos disponíveis.
                    </p>
                  )}
                </div>
              </section>
              <section className="border-t pt-4">
                <h3 className="font-bold">Histórico de alterações</h3>
                <div className="mt-3 space-y-2">
                  {detail.audit.map((a, i) => (
                    <div
                      key={`${a.created_at}-${i}`}
                      className="rounded-lg bg-secondary p-3 text-sm"
                    >
                      <b>
                        {a.action === "trial_extended"
                          ? `Cortesia de ${a.details.days} dias`
                          : "Observação atualizada"}
                      </b>
                      <p className="mt-1 text-xs text-zinc-500">
                        {date(a.created_at, true)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {String(a.details.reason ?? a.details.note ?? "")}
                      </p>
                    </div>
                  ))}
                  {!detail.audit.length && (
                    <p className="text-sm text-zinc-500">
                      Nenhuma alteração administrativa registrada.
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function Stat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value?: string | number;
  icon: typeof Users;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm text-zinc-600">{title}</h2>
        <Icon className="size-5 shrink-0 text-[#805d19]" />
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight">{value ?? "—"}</p>
    </section>
  );
}
function Metric({ title, value }: { title: string; value?: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{title}</dt>
      <dd className="mt-1 break-words font-semibold">{value ?? "—"}</dd>
    </div>
  );
}
function ShopRow({
  shop: s,
  open,
}: {
  shop: Shop;
  open: (id: string) => Promise<void>;
}) {
  return (
    <tr>
      <td className="px-5 py-4">
        <b>{s.name}</b>
        <p className="mt-1 text-xs text-zinc-500">{s.phone || "Sem contato"}</p>
      </td>
      <td className="px-5 py-4">
        {s.email}
        <p className="text-xs text-zinc-500">{s.owner_name}</p>
      </td>
      <td className="px-5 py-4">
        <Badge status={s.billing_state} />
      </td>
      <td className="px-5 py-4">
        {date(
          s.billing_state.startsWith("trial")
            ? s.trial_ends_at
            : s.current_period_ends_at,
        )}
      </td>
      <td className="px-5 py-4">{date(s.created_at)}</td>
      <td className="px-5 py-4">
        <Button variant="outline" size="sm" onClick={() => void open(s.id)}>
          Administrar
        </Button>
      </td>
    </tr>
  );
}
function UserRow({ user: u }: { user: User }) {
  return (
    <tr>
      <td className="px-5 py-4 font-semibold">
        {u.name || "Nome não informado"}
      </td>
      <td className="px-5 py-4">{u.email}</td>
      <td className="px-5 py-4">
        {u.shop_name || "Cadastro da barbearia incompleto"}
      </td>
      <td className="px-5 py-4">
        {u.email_confirmed_at ? "Confirmado" : "Não confirmado"}
      </td>
      <td className="px-5 py-4">{date(u.last_sign_in_at, true)}</td>
      <td className="px-5 py-4">{date(u.created_at)}</td>
    </tr>
  );
}
function PaymentRow({ payment: p }: { payment: Payment }) {
  const url = invoiceLink(p.invoice_url);
  return (
    <tr>
      <td className="max-w-[190px] break-all px-5 py-4 text-xs">
        {p.id}
        <p className="mt-1 text-zinc-500">
          {p.billing_type === "CREDIT_CARD"
            ? "Cartão"
            : p.billing_type === "PIX"
              ? "Pix"
              : p.billing_type || "—"}
        </p>
      </td>
      <td className="px-5 py-4">
        {p.shop_name || "Vínculo não identificado"}
        <p className="text-xs text-zinc-500">{p.email}</p>
      </td>
      <td className="px-5 py-4 font-semibold">{money(p.amount)}</td>
      <td className="px-5 py-4">
        <Badge status={p.status} />
      </td>
      <td className="px-5 py-4">{date(p.due_date)}</td>
      <td className="px-5 py-4">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#805d19] underline"
          >
            Abrir fatura
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
