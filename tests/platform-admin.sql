-- Isolated fixture IDs belong only to the local PGlite test runner.
-- Never run this fixture test against production.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare r jsonb; rejected boolean;
begin
 if not public.platform_admin_access() then raise exception 'Admin denied'; end if;
 r:=public.platform_admin_overview();
 if (r->>'shops_total')::integer<>2 or (r->>'users_total')::integer<>3 or (r->>'users_active_30d')::integer<>2 or (r->>'clients_total')::integer<>1 or (r->>'appointments_total')::integer<>2 then raise exception 'Wrong aggregates: %',r; end if;
 if (r->>'received_month')::numeric<>39.9 or (r->>'overdue_amount')::numeric<>39.9 then raise exception 'Payment duplicated or missing: %',r; end if;
 if (r->>'trials_ended')::integer<>1 or (r->>'shops_past_due')::integer<>1 then raise exception 'Billing states incorrect'; end if;
 r:=public.platform_admin_shops('Test Shop','past_due',1);
 if (r->>'total')::integer<>1 then raise exception 'Filtering failed'; end if;
 r:=public.platform_admin_users('',1);
 if (r->>'total')::integer<>3 then raise exception 'Incomplete accounts missing'; end if;
 r:=public.platform_admin_payments('','all',1);
 if (r->>'total')::integer<>2 then raise exception 'Payment deduplication failed'; end if;
 perform public.platform_admin_save_note('00000000-0000-4000-8000-000000000011','Contacted owner');
 r:=public.platform_admin_shop_detail('00000000-0000-4000-8000-000000000011');
 if r->'shop'->>'note'<>'Contacted owner' or jsonb_array_length(r->'audit')<>1 then raise exception 'Note/audit not persisted'; end if;
 rejected:=false; begin perform public.platform_admin_extend_trial('00000000-0000-4000-8000-000000000011',31,'Invalid amount'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Invalid courtesy allowed'; end if;
 perform public.platform_admin_extend_trial('00000000-0000-4000-8000-000000000011',7,'Customer support courtesy');
 r:=public.platform_admin_shop_detail('00000000-0000-4000-8000-000000000011');
 if r->'shop'->>'billing_state'<>'trialing' or jsonb_array_length(r->'audit')<>2 then raise exception 'Courtesy/audit failed'; end if;
end $$;
reset role;
update public.subscriptions set status='active' where id='00000000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ declare rejected boolean:=false; begin
 begin perform public.platform_admin_extend_trial('00000000-0000-4000-8000-000000000011',7,'Do not replace paid period'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Paid subscription overwritten'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ declare rejected boolean; begin
 if public.platform_admin_access() then raise exception 'Ordinary owner got admin'; end if;
 rejected:=false; begin perform public.platform_admin_overview(); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Owner saw platform data'; end if;
 rejected:=false; begin perform public.platform_admin_save_note('00000000-0000-4000-8000-000000000011','Unauthorized'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Owner changed notes'; end if;
end $$;
reset role;
update auth.users set raw_user_meta_data='{"platform_admin":true,"role":"admin"}' where id='00000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin if public.platform_admin_access() then raise exception 'Editable metadata granted admin'; end if; end $$;
reset role;
insert into barber_private.platform_admins(user_id) values('00000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin if public.platform_admin_access() then raise exception 'Unconfirmed user got admin'; end if; end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ declare rejected boolean:=false; begin
 begin perform public.platform_admin_overview(); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Anonymous user saw data'; end if;
end $$;
reset role;
do $$ begin
 if has_schema_privilege('authenticated','barber_private','usage') or has_table_privilege('authenticated','barber_private.platform_admins','insert') then raise exception 'Private admin data exposed'; end if;
end $$;
rollback;
