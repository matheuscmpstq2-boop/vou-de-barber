-- Client packages are independent from the shop's SaaS subscription.
create schema if not exists barber_private;
revoke all on schema barber_private from public, anon, authenticated;

create table public.customer_plan_templates (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.barbershops(id) on delete cascade,
 name text not null check(length(name) between 2 and 80), price numeric(10,2) not null check(price>=0),
 validity_days integer not null check(validity_days between 1 and 365), benefits jsonb not null,
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.customer_memberships (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.barbershops(id) on delete cascade,
 template_id uuid references public.customer_plan_templates(id), client_name text not null,
 cpf text not null check(cpf ~ '^[0-9]{11}$'), phone text not null,
 plan_name text not null, price numeric(10,2) not null, benefits jsonb not null,
 starts_on date not null, expires_on date not null check(expires_on>=starts_on),
 status text not null default 'active' check(status in ('active','paused','canceled')),
 created_at timestamptz not null default now()
);
create unique index customer_membership_one_current on public.customer_memberships(shop_id,cpf) where status in ('active','paused');
create table public.customer_plan_usage (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.barbershops(id) on delete cascade,
 membership_id uuid not null references public.customer_memberships(id), appointment_id bigint not null,
 service_id bigint not null, state text not null check(state in ('reserved','consumed','released')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(shop_id,appointment_id)
);
create index customer_plan_usage_balance on public.customer_plan_usage(membership_id,service_id,state);
create index customer_plan_templates_shop on public.customer_plan_templates(shop_id);
create index customer_memberships_shop on public.customer_memberships(shop_id);
create index customer_plan_usage_shop on public.customer_plan_usage(shop_id);
create table barber_private.membership_secrets (membership_id uuid primary key references public.customer_memberships(id) on delete cascade, pin_hash text not null);
create table barber_private.plan_lookup_limits (key text primary key, attempts integer not null, started_at timestamptz not null);

alter table public.customer_plan_templates enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.customer_plan_usage enable row level security;
create policy templates_owner on public.customer_plan_templates for all to authenticated using (exists(select 1 from public.barbershops b where b.id=shop_id and b.owner_id=(select auth.uid()))) with check (exists(select 1 from public.barbershops b where b.id=shop_id and b.owner_id=(select auth.uid())));
create policy memberships_owner on public.customer_memberships for select to authenticated using (exists(select 1 from public.barbershops b where b.id=shop_id and b.owner_id=(select auth.uid())));
create policy usage_owner on public.customer_plan_usage for select to authenticated using (exists(select 1 from public.barbershops b where b.id=shop_id and b.owner_id=(select auth.uid())));
revoke all on public.customer_plan_templates,public.customer_memberships,public.customer_plan_usage from public,anon,authenticated;
grant select on public.customer_plan_templates to authenticated;
grant select on public.customer_memberships,public.customer_plan_usage to authenticated;
revoke all on public.customer_plan_templates,public.customer_memberships,public.customer_plan_usage from anon;

create function barber_private.valid_cpf(p text) returns boolean language plpgsql immutable set search_path='' as $$
declare s integer; d integer; i integer; j integer;
begin
 if p is null or p !~ '^[0-9]{11}$' or p=repeat(substr(p,1,1),11) then return false; end if;
 for j in 10..11 loop
  s:=0; for i in 1..j-1 loop s:=s+substr(p,i,1)::integer*(j+1-i); end loop;
  d:=(s*10)%11; if d=10 then d:=0; end if;
  if d<>substr(p,j,1)::integer then return false; end if;
 end loop; return true;
end $$;

create function public.save_customer_plan(p_shop uuid,p_id uuid,p_name text,p_price numeric,p_days integer,p_benefits jsonb,p_active boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare b jsonb; sid bigint; result uuid; payload jsonb;
begin
 select s.payload into payload from public.barbershops s where s.id=p_shop and s.owner_id=auth.uid();
 if not found then raise exception 'Acesso não autorizado'; end if;
 if p_benefits is null or jsonb_typeof(p_benefits)<>'array' or jsonb_array_length(p_benefits)=0 or jsonb_array_length(p_benefits)>50 then raise exception 'Selecione os serviços incluídos'; end if;
 for b in select value from jsonb_array_elements(p_benefits) loop
  sid:=(b->>'serviceId')::bigint;
  if b->>'quantity' is null or b->>'serviceId' is null or (b->>'quantity')::integer not between 1 and 1000 or not exists(select 1 from jsonb_array_elements(payload->'services') s where (s->>'id')::bigint=sid) then raise exception 'Serviço ou quantidade inválida'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'serviceId') from jsonb_array_elements(p_benefits)) then raise exception 'Serviços repetidos'; end if;
 select jsonb_agg(jsonb_build_object('serviceId',(e->>'serviceId')::bigint,'quantity',(e->>'quantity')::integer,'serviceName',s->>'name')) into p_benefits from jsonb_array_elements(p_benefits) e join jsonb_array_elements(payload->'services') s on (s->>'id')::bigint=(e->>'serviceId')::bigint;
 if p_id is null then
  insert into public.customer_plan_templates(shop_id,name,price,validity_days,benefits,active) values(p_shop,trim(p_name),p_price,p_days,p_benefits,p_active) returning id into result;
 else
  update public.customer_plan_templates set name=trim(p_name),price=p_price,validity_days=p_days,benefits=p_benefits,active=p_active where id=p_id and shop_id=p_shop returning id into result;
  if not found then raise exception 'Plano não encontrado'; end if;
 end if; return result;
end $$;

create function public.activate_customer_plan(p_shop uuid,p_template uuid,p_name text,p_cpf text,p_phone text,p_start date,p_pin text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.customer_plan_templates%rowtype; cid uuid; v_cpf text:=regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g'); b jsonb;
begin
 perform 1 from public.barbershops where id=p_shop and owner_id=auth.uid() for update;
 if not found then raise exception 'Acesso não autorizado'; end if;
 if not barber_private.valid_cpf(v_cpf) then raise exception 'CPF inválido'; end if;
 if coalesce(p_pin,'') !~ '^[0-9]{6}$' then raise exception 'O código deve ter seis números'; end if;
 if p_start is null or p_name is null or p_phone is null or length(trim(p_name)) not between 2 and 100 or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 10 and 13 then raise exception 'Nome ou telefone inválido'; end if;
 select * into t from public.customer_plan_templates where id=p_template and shop_id=p_shop and active;
 if not found then raise exception 'Plano indisponível'; end if;
 update public.customer_memberships set status='canceled' where shop_id=p_shop and customer_memberships.cpf=v_cpf and status in ('active','paused');
 insert into public.customer_memberships(shop_id,template_id,client_name,cpf,phone,plan_name,price,benefits,starts_on,expires_on)
 values(p_shop,t.id,trim(p_name),v_cpf,trim(p_phone),t.name,t.price,t.benefits,p_start,p_start+t.validity_days-1) returning id into cid;
 insert into barber_private.membership_secrets values(cid,extensions.crypt(p_pin,extensions.gen_salt('bf')));
 return cid;
end $$;

create function public.manage_customer_membership(p_id uuid,p_status text default null,p_pin text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.customer_memberships m join public.barbershops b on b.id=m.shop_id where m.id=p_id and b.owner_id=auth.uid() for update of m;
 if not found then raise exception 'Acesso não autorizado'; end if;
 if p_status is not null then
  if p_status not in ('active','paused','canceled') then raise exception 'Status inválido'; end if;
  update public.customer_memberships set status=p_status where id=p_id;
 end if;
 if p_pin is not null then
  if coalesce(p_pin,'') !~ '^[0-9]{6}$' then raise exception 'Código inválido'; end if;
  update barber_private.membership_secrets set pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf')) where membership_id=p_id;
 end if;
end $$;

create function barber_private.verify_membership(p_shop uuid,p_cpf text,p_pin text) returns uuid language plpgsql security definer set search_path='' as $$
declare k text; n integer; mid uuid; v_cpf text:=regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
begin
 if p_shop is null or not barber_private.valid_cpf(v_cpf) or coalesce(p_pin,'') !~ '^[0-9]{6}$' then return null; end if;
 k:=p_shop::text||':'||md5(v_cpf);
 insert into barber_private.plan_lookup_limits values(k,1,now()) on conflict(key) do update
 set attempts=case when plan_lookup_limits.started_at<now()-interval '15 minutes' then 1 else plan_lookup_limits.attempts+1 end,
 started_at=case when plan_lookup_limits.started_at<now()-interval '15 minutes' then now() else plan_lookup_limits.started_at end returning attempts into n;
 if n>15 then return null; end if;
 select m.id into mid from public.customer_memberships m join barber_private.membership_secrets s on s.membership_id=m.id
 where m.shop_id=p_shop and m.cpf=v_cpf and m.status='active' and m.expires_on>=(now() at time zone 'America/Sao_Paulo')::date
 and s.pin_hash=extensions.crypt(p_pin,s.pin_hash);
 return mid;
end $$;

create function public.lookup_customer_plan(p_slug text,p_cpf text,p_pin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; mid uuid; result jsonb;
begin
 select id into sid from public.barbershops where slug=lower(trim(p_slug));
 mid:=barber_private.verify_membership(sid,p_cpf,p_pin);
 if mid is null then return jsonb_build_object('error','Não foi possível consultar. Confira CPF e código com a barbearia ou tente novamente mais tarde.'); end if;
 select jsonb_build_object('id',m.id,'planName',m.plan_name,'startsOn',m.starts_on,'expiresOn',m.expires_on,'benefits',
 (select jsonb_agg(b||jsonb_build_object('reserved',(select count(*) from public.customer_plan_usage u where u.membership_id=m.id and u.service_id=(b->>'serviceId')::bigint and u.state='reserved'),
 'consumed',(select count(*) from public.customer_plan_usage u where u.membership_id=m.id and u.service_id=(b->>'serviceId')::bigint and u.state='consumed')))
 from jsonb_array_elements(m.benefits) b)) into result from public.customer_memberships m where m.id=mid;
 return result;
end $$;

create function public.create_plan_booking(p_slug text,p_cpf text,p_pin text,p_client_name text,p_client_phone text,p_service_id bigint,p_barber text,p_date date,p_time time) returns jsonb language plpgsql security definer set search_path='' as $$
declare shop public.barbershops%rowtype; m public.customer_memberships%rowtype; mid uuid; quota integer; used integer; result jsonb; aid bigint;
begin
 select * into shop from public.barbershops where slug=lower(trim(p_slug)) for update;
 if not found then return jsonb_build_object('error','Agenda indisponível'); end if;
 mid:=barber_private.verify_membership(shop.id,p_cpf,p_pin);
 if mid is null then return jsonb_build_object('error','Confira o CPF e o código do plano'); end if;
 select * into m from public.customer_memberships where id=mid for update;
 if m.status<>'active' then return jsonb_build_object('error','Plano indisponível'); end if;
 if p_date<m.starts_on or p_date>m.expires_on then raise exception 'Data fora da validade do plano'; end if;
 select (b->>'quantity')::integer into quota from jsonb_array_elements(m.benefits) b where (b->>'serviceId')::bigint=p_service_id;
 select count(*) into used from public.customer_plan_usage where membership_id=mid and service_id=p_service_id and state in ('reserved','consumed');
 if quota is null or used>=quota then raise exception 'Serviço sem saldo disponível no plano'; end if;
 result:=public.create_public_booking(p_slug,m.client_name,m.phone,p_service_id,p_barber,p_date,p_time);
 aid:=(result->>'appointmentId')::bigint;
 insert into public.customer_plan_usage(shop_id,membership_id,appointment_id,service_id,state) values(shop.id,mid,aid,p_service_id,'reserved');
 update public.barbershops set payload=jsonb_set(payload,'{appointments}',
 (select jsonb_agg(case when (a->>'id')::bigint=aid then a||jsonb_build_object('price',0,'membershipId',mid,'planName',m.plan_name,'serviceId',p_service_id) else a end) from jsonb_array_elements(payload->'appointments') a)) where id=shop.id;
 return result||jsonb_build_object('planName',m.plan_name);
end $$;

create function barber_private.sync_plan_usage() returns trigger language plpgsql security definer set search_path='' as $$
declare u public.customer_plan_usage%rowtype; a jsonb; target text; quota integer; used integer;
begin
 for u in select * from public.customer_plan_usage where shop_id=new.id order by id for update loop
  select value into a from jsonb_array_elements(coalesce(new.payload->'appointments','[]')) where (value->>'id')::bigint=u.appointment_id;
  if a is null then target:=case when u.state='consumed' then 'consumed' else 'released' end;
  elsif a->>'status'='Cancelado' then target:='released';
  elsif a->>'status'='Finalizado' then target:='consumed'; else target:='reserved'; end if;
  if a is not null and a->>'status'<>'Cancelado' then
   if a->>'membershipId' is distinct from u.membership_id::text or (a->>'serviceId')::bigint is distinct from u.service_id or (a->>'price')::numeric is distinct from 0 then raise exception 'Dados de atendimento do plano não podem ser alterados'; end if;
  end if;
  if u.state='released' and target<>'released' then
   select (b->>'quantity')::integer into quota from public.customer_memberships m,jsonb_array_elements(m.benefits) b where m.id=u.membership_id and (b->>'serviceId')::bigint=u.service_id;
   select count(*) into used from public.customer_plan_usage where membership_id=u.membership_id and service_id=u.service_id and state in ('reserved','consumed');
   if used>=quota then raise exception 'Saldo insuficiente para reabrir atendimento'; end if;
  end if;
  if target<>u.state then update public.customer_plan_usage set state=target,updated_at=now() where id=u.id; end if;
 end loop; return new;
end $$;
create trigger sync_customer_plan_usage after update of payload on public.barbershops for each row execute function barber_private.sync_plan_usage();

create function public.save_barbershop_state(p_shop uuid,p_payload jsonb,p_version timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.barbershops%rowtype;
begin
 select * into b from public.barbershops where id=p_shop and owner_id=auth.uid() for update;
 if not found then raise exception 'Acesso não autorizado'; end if;
 if b.updated_at is distinct from p_version then return jsonb_build_object('conflict',true,'payload',b.payload,'version',b.updated_at); end if;
 update public.barbershops set payload=p_payload,name=p_payload->>'shopName',phone=p_payload->>'shopPhone',address=p_payload->>'shopAddress',updated_at=clock_timestamp() where id=p_shop returning * into b;
 return jsonb_build_object('version',b.updated_at);
end $$;

revoke all on all functions in schema barber_private from public,anon,authenticated;
revoke all on function public.save_customer_plan(uuid,uuid,text,numeric,integer,jsonb,boolean),public.activate_customer_plan(uuid,uuid,text,text,text,date,text),public.manage_customer_membership(uuid,text,text),public.save_barbershop_state(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_customer_plan(uuid,uuid,text,numeric,integer,jsonb,boolean),public.activate_customer_plan(uuid,uuid,text,text,text,date,text),public.manage_customer_membership(uuid,text,text),public.save_barbershop_state(uuid,jsonb,timestamptz) to authenticated;
revoke all on function public.lookup_customer_plan(text,text,text),public.create_plan_booking(text,text,text,text,text,bigint,text,date,time) from public;
grant execute on function public.lookup_customer_plan(text,text,text),public.create_plan_booking(text,text,text,text,text,bigint,text,date,time) to anon,authenticated;
