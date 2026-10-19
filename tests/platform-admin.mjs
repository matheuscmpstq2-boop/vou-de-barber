const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
select set_config('vdb.platform_admin_email','admin@example.invalid',false);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz default now(),is_anonymous boolean default false);
create table public.barbershops(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),name text,phone text,address text,slug text,payload jsonb default '{}',created_at timestamptz default now());
create table public.subscriptions(id uuid primary key default gen_random_uuid(),barbershop_id uuid unique references public.barbershops(id),owner_id uuid,status text,trial_ends_at timestamptz,current_period_ends_at timestamptz,updated_at timestamptz default now(),asaas_subscription_id text,asaas_checkout_id text,last_payment_id text);
create table public.asaas_webhook_events(event_id text primary key,event_type text,payload jsonb,processed_at timestamptz,processing_error text,created_at timestamptz default now());
insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values ('00000000-0000-4000-8000-000000000001','admin@example.invalid',now(),now()),('00000000-0000-4000-8000-000000000002','owner@example.invalid',now(),now()),('00000000-0000-4000-8000-000000000003','pending@example.invalid',null,null);
insert into public.barbershops(id,owner_id,name,phone,address,slug,payload) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','Test Shop','27999990000','','test','{"clients":[{}],"appointments":[{},{}]}'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','Second Test Shop','','','test-2','{}');
insert into public.subscriptions(id,barbershop_id,owner_id,status,trial_ends_at,asaas_subscription_id) values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','past_due',now()-interval '1 day','sub_test'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','trialing',now()-interval '1 day',null);
insert into public.asaas_webhook_events(event_id,event_type,payload,processed_at) values
 ('ev_1','PAYMENT_CONFIRMED',jsonb_build_object('dateCreated','2026-10-01T10:00:00Z','payment',jsonb_build_object('id','pay_1','subscription','sub_test','status','CONFIRMED','value',39.90,'paymentDate',to_char(now(),'YYYY-MM-DD'))),now()),
 ('ev_2','PAYMENT_RECEIVED',jsonb_build_object('dateCreated','2026-10-02T10:00:00Z','payment',jsonb_build_object('id','pay_1','subscription','sub_test','status','RECEIVED','value',39.90,'paymentDate',to_char(now(),'YYYY-MM-DD'))),now()),
 ('ev_3','PAYMENT_OVERDUE',jsonb_build_object('dateCreated','2026-10-03T10:00:00Z','payment',jsonb_build_object('id','pay_2','subscription','sub_test','status','OVERDUE','value',39.90,'dueDate','2026-10-01')),now());
`);
await db.exec(readFileSync(new URL('../db/platform-admin.sql', import.meta.url),'utf8'));
const sql = readFileSync(new URL('./platform-admin.sql', import.meta.url),'utf8');
await db.exec(sql);
console.log('PASS: admin access, deny non-admin/anonymous/unverified, tenant privacy, aggregates, payment deduplication, trial state, courtesy bounds, active subscription protection, notes and audit');
await db.close();
