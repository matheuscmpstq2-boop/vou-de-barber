"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Ticket } from "lucide-react";
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

export type PlanBenefit = {
  serviceId: number;
  serviceName: string;
  quantity: number;
};
export type PublicPlan = {
  id: string;
  planName: string;
  startsOn: string;
  expiresOn: string;
  benefits: (PlanBenefit & { reserved: number; consumed: number })[];
};
type Service = { id: number; name: string; active: boolean };
type Template = {
  id: string;
  name: string;
  price: number;
  validity_days: number;
  benefits: PlanBenefit[];
  active: boolean;
};
type Member = {
  id: string;
  template_id: string;
  client_name: string;
  cpf: string;
  phone: string;
  plan_name: string;
  price: number;
  benefits: PlanBenefit[];
  starts_on: string;
  expires_on: string;
  status: string;
};
type Usage = {
  membership_id: string;
  service_id: number;
  state: string;
  appointment_id: number;
  created_at: string;
};
const money = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dateLabel = (v: string) => v.split("-").reverse().join("/");
const pin = () =>
  String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));

export function CustomerPlans({
  shopId,
  services,
}: {
  shopId: string;
  services: Service[];
}) {
  const [templates, setTemplates] = useState<Template[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Template | "new" | null>(null),
    [benefits, setBenefits] = useState<Record<number, number>>({});
  const [activation, setActivation] = useState<Member | "new" | null>(null),
    [code, setCode] = useState(""),
    [receipt, setReceipt] = useState<{ name: string; code: string } | null>(
      null,
    );
  const [history, setHistory] = useState<Member | null>(null);
  const fetchPlans = useCallback(
    () =>
      Promise.all([
        supabase
          .from("customer_plan_templates")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_memberships")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_plan_usage")
          .select("membership_id,service_id,state,appointment_id,created_at")
          .eq("shop_id", shopId),
      ]),
    [shopId],
  );
  const applyPlans = useCallback(
    ([t, m, u]: Awaited<ReturnType<typeof fetchPlans>>) => {
      if (t.error || m.error || u.error)
        setMessage("Não foi possível carregar os planos. Tente atualizar.");
      else {
        setTemplates(t.data || []);
        setMembers(m.data || []);
        setUsage(u.data || []);
      }
      setLoading(false);
    },
    [],
  );
  const load = useCallback(async () => {
    applyPlans(await fetchPlans());
  }, [fetchPlans, applyPlans]);
  useEffect(() => {
    let mounted = true;
    void fetchPlans().then((results) => {
      if (mounted) applyPlans(results);
    });
    return () => {
      mounted = false;
    };
  }, [fetchPlans, applyPlans]);
  function edit(t: Template | "new") {
    setMessage("");
    setBenefits(
      t === "new"
        ? {}
        : Object.fromEntries(t.benefits.map((b) => [b.serviceId, b.quantity])),
    );
    setEditor(t);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const included = Object.entries(benefits)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ serviceId: Number(id), quantity }));
    if (!included.length) {
      setMessage("Inclua pelo menos um serviço no plano.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("save_customer_plan", {
      p_shop: shopId,
      p_id: editor === "new" ? null : editor?.id,
      p_name: f.get("name"),
      p_price: Number(f.get("price")),
      p_days: Number(f.get("days")),
      p_benefits: included,
      p_active: f.get("active") === "on",
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setEditor(null);
      setMessage("Plano salvo.");
      await load();
    }
  }
  function activate(m: Member | "new") {
    setMessage("");
    setCode(pin());
    setActivation(m);
  }
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget),
      client = String(f.get("name"));
    setBusy(true);
    const { error } = await supabase.rpc("activate_customer_plan", {
      p_shop: shopId,
      p_template: f.get("template"),
      p_name: client,
      p_cpf: f.get("cpf"),
      p_phone: f.get("phone"),
      p_start: f.get("start"),
      p_pin: code,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setActivation(null);
      setReceipt({ name: client, code });
      setMessage("Plano ativado. Entregue o código ao cliente.");
      await load();
    }
  }
  async function manage(m: Member, status: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("manage_customer_membership", {
      p_id: m.id,
      p_status: status,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Plano atualizado.");
      await load();
    }
  }
  async function reset(m: Member) {
    if (busy) return;
    const next = pin();
    setBusy(true);
    const { error } = await supabase.rpc("manage_customer_membership", {
      p_id: m.id,
      p_pin: next,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setReceipt({ name: m.client_name, code: next });
  }
  const current = activation && activation !== "new" ? activation : null;
  const template = editor && editor !== "new" ? editor : null;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-[#151515] p-6 text-white">
        <Ticket className="mb-3 size-7 text-[#c99f3d]" />
        <h2 className="text-2xl font-bold">Planos de clientes</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-300">
          Crie pacotes de cortes, barba ou outros serviços. Ative por CPF e
          entregue o código de acesso ao cliente para usar no link de
          agendamento.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          Agendamento reserva o crédito. Finalizar consome; cancelar libera. A
          cobrança destes planos é feita diretamente pela barbearia.
        </p>
      </section>
      {message && (
        <p role="status" className="rounded-xl border bg-amber-50 p-4 text-sm">
          {message}
        </p>
      )}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Planos disponíveis</h3>
          <Button onClick={() => edit("new")} disabled={!services.length}>
            <Plus className="size-4" />
            Criar plano
          </Button>
        </div>
        {!services.length && (
          <p className="rounded-xl border bg-white p-5 text-sm text-zinc-600">
            Cadastre os serviços da barbearia antes de criar um plano.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <article key={t.id} className="rounded-2xl border bg-white p-5">
              <div className="flex justify-between gap-3">
                <h4 className="font-bold">{t.name}</h4>
                <span className="text-xs text-zinc-500">
                  {t.active ? "Ativo" : "Desativado"}
                </span>
              </div>
              <p className="mt-2 text-xl font-bold">
                {money(t.price)}{" "}
                <span className="text-xs font-normal text-zinc-500">
                  / {t.validity_days} dias
                </span>
              </p>
              <ul className="my-4 space-y-1 text-sm text-zinc-600">
                {t.benefits.map((b) => (
                  <li key={b.serviceId}>
                    {b.quantity} × {b.serviceName}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => edit(t)}>
                Editar plano
              </Button>
            </article>
          ))}
        </div>
        {!loading && !templates.length && !!services.length && (
          <p className="rounded-xl border bg-white p-5 text-sm text-zinc-600">
            Nenhum plano criado. Escolha os serviços, quantidades, preço e
            validade.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Planos contratados</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              disabled={loading}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
            <Button
              onClick={() => activate("new")}
              disabled={!templates.some((t) => t.active)}
            >
              <Plus className="size-4" />
              Ativar para cliente
            </Button>
          </div>
        </div>
        <Input
          aria-label="Buscar plano por cliente ou CPF"
          placeholder="Buscar por nome ou CPF"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading ? (
          <p className="text-sm text-zinc-500">Carregando planos...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {members
              .filter(
                (m) =>
                  m.client_name.toLowerCase().includes(search.toLowerCase()) ||
                  (!!search.replace(/\D/g, "") &&
                    m.cpf.includes(search.replace(/\D/g, ""))),
              )
              .map((m) => {
                const label =
                  m.status === "canceled"
                    ? "Cancelado"
                    : m.status === "paused"
                      ? "Pausado"
                      : m.expires_on < day()
                        ? "Vencido"
                        : m.starts_on > day()
                          ? "Ainda não iniciou"
                          : "Ativo";
                return (
                  <article
                    key={m.id}
                    className="rounded-2xl border bg-white p-5"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <h4 className="font-bold">{m.client_name}</h4>
                        <p className="text-xs text-zinc-500">
                          CPF •••.•••.{m.cpf.slice(6, 9)}-{m.cpf.slice(9)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    <p className="mt-3 font-semibold text-[#805d19]">
                      {m.plan_name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {dateLabel(m.starts_on)} até {dateLabel(m.expires_on)} ·{" "}
                      {money(m.price)}
                    </p>
                    <div className="my-4 space-y-2">
                      {m.benefits.map((b) => {
                        const rows = usage.filter(
                            (u) =>
                              u.membership_id === m.id &&
                              Number(u.service_id) === b.serviceId,
                          ),
                          consumed = rows.filter(
                            (u) => u.state === "consumed",
                          ).length,
                          reserved = rows.filter(
                            (u) => u.state === "reserved",
                          ).length;
                        return (
                          <div
                            key={b.serviceId}
                            className="rounded-xl bg-secondary p-3 text-sm"
                          >
                            <div className="flex justify-between gap-2">
                              <b>{b.serviceName}</b>
                              <b>
                                {Math.max(0, b.quantity - consumed - reserved)}{" "}
                                disponíveis
                              </b>
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">
                              {consumed} utilizados · {reserved} reservados ·{" "}
                              {b.quantity} no plano
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistory(m)}
                      >
                        Histórico
                      </Button>
                      {m.status !== "canceled" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void manage(
                                m,
                                m.status === "paused" ? "active" : "paused",
                              )
                            }
                          >
                            {m.status === "paused" ? "Reativar" : "Pausar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void reset(m)}
                          >
                            Novo código
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void manage(m, "canceled")}
                          >
                            Cancelar plano
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        disabled={!templates.some((t) => t.active)}
                        onClick={() => activate(m)}
                      >
                        Renovar
                      </Button>
                    </div>
                  </article>
                );
              })}
          </div>
        )}
        {!loading && !members.length && (
          <p className="rounded-xl border bg-white p-5 text-sm text-zinc-600">
            Nenhum cliente com plano. Ative um plano após acertar a contratação
            com o cliente.
          </p>
        )}
      </section>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {template ? "Editar plano" : "Criar plano"}
            </DialogTitle>
            <DialogDescription>
              Alterações valem para novas ativações. Planos já contratados
              mantêm seus créditos.
            </DialogDescription>
          </DialogHeader>
          {message && (
            <p role="alert" className="text-sm text-red-700">
              {message}
            </p>
          )}
          <form onSubmit={save} className="space-y-4">
            <label className="block text-sm">
              Nome do plano
              <Input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={template?.name}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Preço (R$)
                <Input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={template?.price}
                />
              </label>
              <label className="text-sm">
                Validade (dias)
                <Input
                  name="days"
                  type="number"
                  min="1"
                  max="365"
                  required
                  defaultValue={template?.validity_days || 30}
                />
              </label>
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">
                Quantidade por serviço (0 = não incluído)
              </legend>
              {services.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    {s.name}
                    {!s.active && " (desativado)"}
                  </span>
                  <Input
                    className="w-24"
                    type="number"
                    min="0"
                    max="1000"
                    value={benefits[s.id] || 0}
                    onChange={(e) =>
                      setBenefits({
                        ...benefits,
                        [s.id]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="active"
                type="checkbox"
                defaultChecked={template?.active ?? true}
              />
              Disponível para novas contratações
            </label>
            <Button disabled={busy} className="w-full">
              {busy ? "Salvando..." : "Salvar plano"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!activation}
        onOpenChange={(open) => {
          if (!open && !busy) setActivation(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {current ? "Renovar plano" : "Ativar plano para cliente"}
            </DialogTitle>
            <DialogDescription>
              A renovação cria um novo saldo e preserva o histórico anterior.
              Agendamentos já reservados continuam vinculados ao plano anterior.
            </DialogDescription>
          </DialogHeader>
          {message && (
            <p role="alert" className="text-sm text-red-700">
              {message}
            </p>
          )}
          <form onSubmit={assign} className="space-y-3">
            <label className="block text-sm">
              Plano
              <select
                name="template"
                required
                defaultValue={
                  templates.some(
                    (t) => t.id === current?.template_id && t.active,
                  )
                    ? current?.template_id
                    : ""
                }
                className="mt-1 h-10 w-full rounded-md border px-3"
              >
                <option value="" disabled>
                  Selecione o plano
                </option>
                {templates
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {money(t.price)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              Nome completo
              <Input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={current?.client_name}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              CPF
              <Input
                name="cpf"
                required
                inputMode="numeric"
                maxLength={14}
                defaultValue={current?.cpf}
                placeholder="000.000.000-00"
              />
            </label>
            <label className="block text-sm">
              WhatsApp
              <Input
                name="phone"
                required
                type="tel"
                defaultValue={current?.phone}
              />
            </label>
            <label className="block text-sm">
              Data de início
              <Input name="start" required type="date" defaultValue={day()} />
            </label>
            <label className="block text-sm">
              Código de acesso (entregue ao cliente)
              <Input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                pattern="[0-9]{6}"
                inputMode="numeric"
              />
            </label>
            <p className="text-xs text-zinc-500">
              No link público, o cliente usa CPF e este código. O sistema não
              cobra o cliente automaticamente.
            </p>
            <Button disabled={busy} className="w-full">
              {busy ? "Ativando..." : "Ativar plano"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!receipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Código do cliente</DialogTitle>
            <DialogDescription>
              Entregue a {receipt?.name}. O código anterior deixa de funcionar
              após a redefinição.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-amber-50 p-6 text-center text-3xl font-bold tracking-[.3em]">
            {receipt?.code}
          </p>
          <p className="text-sm text-zinc-500">
            Guarde ou copie agora. Por segurança, o código não pode ser
            consultado depois.
          </p>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(receipt?.code || "");
                setMessage("Código copiado.");
              } catch {
                setMessage("Selecione o código e copie manualmente.");
              }
            }}
          >
            Copiar código
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de {history?.client_name}</DialogTitle>
            <DialogDescription>
              {history?.plan_name} · cada agendamento utiliza um crédito do
              serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {usage
              .filter((u) => u.membership_id === history?.id)
              .map((u) => (
                <div
                  key={u.appointment_id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <b>
                    {
                      history?.benefits.find(
                        (b) => b.serviceId === Number(u.service_id),
                      )?.serviceName
                    }
                  </b>
                  <p className="text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {u.state === "consumed"
                      ? "Utilizado"
                      : u.state === "reserved"
                        ? "Reservado"
                        : "Liberado"}
                  </p>
                </div>
              ))}
            {!usage.some((u) => u.membership_id === history?.id) && (
              <p className="text-sm text-zinc-500">
                Nenhum agendamento neste plano.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
