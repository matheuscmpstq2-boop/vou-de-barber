-- Platform operations. Run once on the Vou de Barber project after it is restored.
-- Admin enrollment is resolved from a verified Auth account, never user_metadata.
begin;
create schema if not exists barber_private;
revoke all on schema barber_private from public,anon,authenticated;
create table if not exists barber_private.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists barber_private.platform_shop_notes (
 shop_id uuid primary key references public.barbershops(id) on delete cascade,
 note text not null default '' check(length(note)<=5000),
 updated_at timestamptz not null default now()
);
create table if not exists barber_private.platform_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 shop_id uuid references public.barbershops(id) on delete set null,
 action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists platform_audit_shop_date on barber_private.platform_audit(shop_id,created_at desc);
alter table barber_private.platform_admins enable row level security;
alter table barber_private.platform_shop_notes enable row level security;
alter table barber_private.platform_audit enable row level security;
revoke all on barber_private.platform_admins,barber_private.platform_shop_notes,barber_private.platform_audit from public,anon,authenticated;

create or replace function public.platform_admin_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from barber_private.platform_admins a join auth.users u on u.id=a.user_id
  where a.user_id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 );
$$;
create or replace function barber_private.require_platform_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.platform_admin_access() then raise exception 'Acesso restrito ao administrador da plataforma' using errcode='42501'; end if;
end $$;
revoke all on function barber_private.require_platform_admin() from public,anon,authenticated;

create or replace view barber_private.platform_shops as
 select b.id,b.owner_id,b.name,b.phone,b.address,b.slug,b.created_at,u.email,
 coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'') as owner_name,
 u.last_sign_in_at,u.email_confirmed_at,s.id as subscription_id,s.status::text as subscription_status,
 s.trial_ends_at,s.current_period_ends_at,
 case when s.id is null then 'no_plan'
 when s.status='trialing' and coalesce(s.trial_ends_at,'-infinity')<now() then 'trial_ended'
 when s.status='active' and s.current_period_ends_at is not null and s.current_period_ends_at<now() then 'access_expired'
 else s.status::text end as billing_state,
 coalesce(to_jsonb(s)->>'asaas_subscription_id','') as asaas_subscription_id,
 coalesce(to_jsonb(s)->>'asaas_checkout_id','') as asaas_checkout_id,
 case when jsonb_typeof(b.payload->'clients')='array' then jsonb_array_length(b.payload->'clients') else 0 end as clients_count,
 case when jsonb_typeof(b.payload->'appointments')='array' then jsonb_array_length(b.payload->'appointments') else 0 end as appointments_count,
 coalesce(n.note,'') as note
 from public.barbershops b join auth.users u on u.id=b.owner_id
 left join public.subscriptions s on s.barbershop_id=b.id
 left join barber_private.platform_shop_notes n on n.shop_id=b.id;

create or replace view barber_private.platform_payments as
 with latest as (
  select distinct on (w.payload->'payment'->>'id')
   w.payload->'payment' as payment,w.event_id,w.event_type,w.processed_at,w.processing_error,
   coalesce(w.payload->>'dateCreated',w.received_at::text,'') as event_at
  from public.asaas_webhook_events w where nullif(w.payload->'payment'->>'id','') is not null
  order by w.payload->'payment'->>'id',coalesce(w.payload->>'dateCreated',w.received_at::text,'') desc,w.event_id desc
 )
 select payment->>'id' as id,shop.id as shop_id,shop.name as shop_name,shop.email,
 case when event_type='PAYMENT_DELETED' then 'DELETED' when event_type='PAYMENT_REFUNDED' then 'REFUNDED' else upper(coalesce(nullif(payment->>'status',''),replace(event_type,'PAYMENT_',''))) end as status,
 case when payment->>'value' ~ '^[0-9]+(\.[0-9]+)?$' then (payment->>'value')::numeric else null end as amount,
 payment->>'billingType' as billing_type,payment->>'dueDate' as due_date,
 coalesce(payment->>'paymentDate',payment->>'clientPaymentDate') as payment_date,
 payment->>'invoiceUrl' as invoice_url,event_id,event_type,event_at,processing_error
 from latest l left join lateral (
  select s.id,s.name,s.email from barber_private.platform_shops s
  where (nullif(payment->>'subscription','') is not null and payment->>'subscription'=s.asaas_subscription_id)
   or (nullif(payment->>'externalReference','') is not null and payment->>'externalReference'=s.subscription_id::text)
   or exists(select 1 from public.subscriptions sub where sub.id=s.subscription_id and nullif(to_jsonb(sub)->>'last_payment_id','')=payment->>'id')
  limit 1
 ) shop on true;
revoke all on barber_private.platform_shops,barber_private.platform_payments from public,anon,authenticated;

create or replace function public.platform_admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform barber_private.require_platform_admin();
 select jsonb_build_object(
  'generated_at',now(),
  'shops_total',(select count(*) from public.barbershops),
  'users_total',(select count(*) from auth.users where not coalesce(is_anonymous,false)),
  'users_active_30d',(select count(*) from auth.users where last_sign_in_at>=now()-interval '30 days' and not coalesce(is_anonymous,false)),
  'shops_active',(select count(*) from barber_private.platform_shops where billing_state='active'),
  'shops_past_due',(select count(*) from barber_private.platform_shops where billing_state='past_due'),
  'trials_active',(select count(*) from barber_private.platform_shops where billing_state='trialing'),
  'trials_ended',(select count(*) from barber_private.platform_shops where billing_state='trial_ended'),
  'checkouts_pending',(select count(*) from barber_private.platform_shops where billing_state='pending'),
  'trials_ending_7d',(select count(*) from barber_private.platform_shops where billing_state='trialing' and trial_ends_at<now()+interval '7 days'),
  'clients_total',(select coalesce(sum(clients_count),0) from barber_private.platform_shops),
  'appointments_total',(select coalesce(sum(appointments_count),0) from barber_private.platform_shops),
  'received_month',(select coalesce(sum(amount),0) from barber_private.platform_payments where status='RECEIVED' and payment_date>=to_char(date_trunc('month',now() at time zone 'America/Sao_Paulo'),'YYYY-MM-DD') and payment_date<=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD')),
  'overdue_amount',(select coalesce(sum(amount),0) from barber_private.platform_payments where status='OVERDUE'),
  'monthly_price',39.90,
  'estimated_mrr',(select count(*)*39.90 from barber_private.platform_shops where billing_state='active'),
  'billing_states',(select coalesce(jsonb_object_agg(billing_state,total),'{}') from (select billing_state,count(*) total from barber_private.platform_shops group by billing_state) c),
  'webhook_errors',(select count(*) from public.asaas_webhook_events where processing_error is not null),
  'last_webhook_at',(select max(w.received_at) from public.asaas_webhook_events w),
  'recent_webhook_errors',(select coalesce(jsonb_agg(e),'[]') from (select event_id,event_type,processing_error,w.received_at as created_at from public.asaas_webhook_events w where processing_error is not null order by w.received_at::text desc limit 10) e)
 ) into result;
 return result;
end $$;

create or replace function public.platform_admin_shops(p_search text default '',p_status text default 'all',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; q text:=left(trim(coalesce(p_search,'')),120);
begin
 perform barber_private.require_platform_admin();
 with filtered as (select * from barber_private.platform_shops where (coalesce(p_status,'all')='all' or billing_state=p_status) and (q='' or name ilike '%'||q||'%' or email ilike '%'||q||'%' or phone ilike '%'||q||'%'))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',(select coalesce(jsonb_agg(r),'[]') from (select * from filtered order by created_at desc,id limit 25 offset (greatest(coalesce(p_page,1),1)-1)*25) r)) into result;
 return result;
end $$;

create or replace function public.platform_admin_users(p_search text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; q text:=left(trim(coalesce(p_search,'')),120);
begin
 perform barber_private.require_platform_admin();
 with filtered as (
 select u.id,u.email,u.created_at,u.last_sign_in_at,u.email_confirmed_at,
 coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'') as name,
 b.name as shop_name,b.id as shop_id
 from auth.users u left join public.barbershops b on b.owner_id=u.id
 where not coalesce(u.is_anonymous,false) and (q='' or u.email ilike '%'||q||'%' or b.name ilike '%'||q||'%')
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',(select coalesce(jsonb_agg(r),'[]') from (select * from filtered order by created_at desc,id limit 25 offset (greatest(coalesce(p_page,1),1)-1)*25) r)) into result;
 return result;
end $$;

create or replace function public.platform_admin_payments(p_search text default '',p_status text default 'all',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; q text:=left(trim(coalesce(p_search,'')),120);
begin
 perform barber_private.require_platform_admin();
 with filtered as (select * from barber_private.platform_payments where (coalesce(p_status,'all')='all' or status=p_status) and (q='' or shop_name ilike '%'||q||'%' or email ilike '%'||q||'%' or id ilike '%'||q||'%'))
 select jsonb_build_object('total',(select count(*) from filtered),'rows',(select coalesce(jsonb_agg(r),'[]') from (select * from filtered order by event_at desc,id limit 25 offset (greatest(coalesce(p_page,1),1)-1)*25) r)) into result;
 return result;
end $$;

create or replace function public.platform_admin_shop_detail(p_shop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform barber_private.require_platform_admin();
 select jsonb_build_object('shop',to_jsonb(s),'payments',(select coalesce(jsonb_agg(p),'[]') from (select * from barber_private.platform_payments where shop_id=p_shop order by event_at desc limit 30) p),'audit',(select coalesce(jsonb_agg(a),'[]') from (select action,details,created_at from barber_private.platform_audit where shop_id=p_shop order by created_at desc limit 50) a)) into result from barber_private.platform_shops s where id=p_shop;
 if result is null then raise exception 'Barbearia não encontrada'; end if;
 return result;
end $$;

create or replace function public.platform_admin_save_note(p_shop uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform barber_private.require_platform_admin();
 if p_note is null or length(p_note)>5000 then raise exception 'Observação inválida'; end if;
 insert into barber_private.platform_shop_notes(shop_id,note) values(p_shop,trim(p_note)) on conflict(shop_id) do update set note=excluded.note,updated_at=now();
 insert into barber_private.platform_audit(actor_id,shop_id,action,details) values(auth.uid(),p_shop,'note_updated',jsonb_build_object('note',trim(p_note)));
end $$;

create or replace function public.platform_admin_extend_trial(p_shop uuid,p_days integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.subscriptions%rowtype; until_at timestamptz;
begin
 perform barber_private.require_platform_admin();
 if p_days is null or p_days not between 1 and 30 or p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'Informe de 1 a 30 dias e o motivo da cortesia'; end if;
 select * into s from public.subscriptions where barbershop_id=p_shop for update;
 if not found then raise exception 'Esta barbearia ainda não possui assinatura'; end if;
 if s.status='active' then raise exception 'A assinatura já está ativa; não altere o período pago'; end if;
 until_at:=greatest(coalesce(s.trial_ends_at,now()),now())+make_interval(days=>p_days);
 update public.subscriptions set status='trialing',trial_ends_at=until_at,updated_at=now() where id=s.id;
 insert into barber_private.platform_audit(actor_id,shop_id,action,details) values(auth.uid(),p_shop,'trial_extended',jsonb_build_object('days',p_days,'reason',trim(p_reason),'previous_status',s.status,'previous_trial_ends_at',s.trial_ends_at,'trial_ends_at',until_at));
end $$;

revoke all on function public.platform_admin_access(),public.platform_admin_overview(),public.platform_admin_shops(text,text,integer),public.platform_admin_users(text,integer),public.platform_admin_payments(text,text,integer),public.platform_admin_shop_detail(uuid),public.platform_admin_save_note(uuid,text),public.platform_admin_extend_trial(uuid,integer,text) from public,anon;
grant execute on function public.platform_admin_access(),public.platform_admin_overview(),public.platform_admin_shops(text,text,integer),public.platform_admin_users(text,integer),public.platform_admin_payments(text,text,integer),public.platform_admin_shop_detail(uuid),public.platform_admin_save_note(uuid,text),public.platform_admin_extend_trial(uuid,integer,text) to authenticated;

insert into barber_private.platform_admins(user_id)
select id from auth.users where lower(email)=lower(nullif(current_setting('vdb.platform_admin_email',true),'')) and email_confirmed_at is not null and not coalesce(is_anonymous,false)
on conflict(user_id) do nothing;
do $$ begin
 if not exists(select 1 from barber_private.platform_admins a join auth.users u on u.id=a.user_id where lower(u.email)=lower(nullif(current_setting('vdb.platform_admin_email',true),'')) and u.email_confirmed_at is not null) then raise exception 'Defina vdb.platform_admin_email com o e-mail confirmado do proprietário antes de habilitar o painel'; end if;
end $$;
commit;
