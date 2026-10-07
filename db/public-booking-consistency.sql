CREATE OR REPLACE FUNCTION public.create_public_booking(p_slug text, p_client_name text, p_client_phone text, p_service_id bigint, p_barber text, p_date date, p_time time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  v_service jsonb;
  v_barber jsonb;
  v_rule jsonb;
  v_appointments jsonb;
  v_clients jsonb;
  v_start time;
  v_end time;
  v_interval integer;
  v_start_minutes integer;
  v_slot_minutes integer;
  v_id bigint;
begin
  if length(trim(coalesce(p_client_name,''))) < 2 or length(trim(coalesce(p_client_name,''))) > 100 then
    raise exception 'Nome inválido';
  end if;
  if length(regexp_replace(coalesce(p_client_phone,''), '\D', '', 'g')) < 10 then
    raise exception 'WhatsApp inválido';
  end if;
  if p_date is null or p_date < (now() at time zone 'America/Sao_Paulo')::date or p_date > (now() at time zone 'America/Sao_Paulo')::date + 180 then
    raise exception 'Data inválida';
  end if;

  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_slug))
  for update;

  if not found then raise exception 'Barbearia não encontrada'; end if;

  select value into v_service
  from jsonb_array_elements(coalesce(v_shop.payload->'services','[]'::jsonb))
  where (value->>'id')::bigint = p_service_id and coalesce((value->>'active')::boolean,false)
  limit 1;
  if v_service is null then raise exception 'Serviço indisponível'; end if;

  v_rule := v_shop.payload->'serviceDayRules'->to_char(p_date,'YYYY-MM-DD');
  if v_rule is not null and not exists (
    select 1 from jsonb_array_elements_text(v_rule) x where x::bigint = p_service_id
  ) then raise exception 'Serviço indisponível nesta data'; end if;

  select value into v_barber
  from jsonb_array_elements(coalesce(v_shop.payload->'barbers','[]'::jsonb))
  where value->>'name' = trim(p_barber) and coalesce((value->>'active')::boolean,false)
  limit 1;
  if v_barber is null then raise exception 'Profissional indisponível'; end if;

  v_start := coalesce((v_shop.payload->>'bookingStart')::time, '08:00'::time);
  v_end := coalesce((v_shop.payload->>'bookingEnd')::time, '18:00'::time);
  v_interval := greatest(coalesce((v_shop.payload->>'bookingInterval')::integer,60),15);
  if p_time is null or p_time < v_start or p_time > v_end then raise exception 'Horário indisponível'; end if;
  v_start_minutes := extract(hour from v_start)::integer*60 + extract(minute from v_start)::integer;
  v_slot_minutes := extract(hour from p_time)::integer*60 + extract(minute from p_time)::integer;
  if mod(v_slot_minutes-v_start_minutes,v_interval) <> 0 then raise exception 'Horário inválido'; end if;

  v_appointments := coalesce(v_shop.payload->'appointments','[]'::jsonb);
  if exists (
    select 1 from jsonb_array_elements(v_appointments) a
    where a->>'date'=to_char(p_date,'YYYY-MM-DD')
      and a->>'time'=to_char(p_time,'HH24:MI')
      and a->>'barber'=trim(p_barber)
      and a->>'status'<>'Cancelado'
  ) then raise exception 'Este horário acabou de ser ocupado'; end if;

  v_id := greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint, coalesce((select max((a->>'id')::bigint)+1 from jsonb_array_elements(v_appointments) a),0));
  v_appointments := v_appointments || jsonb_build_array(jsonb_build_object(
    'id',v_id,'date',to_char(p_date,'YYYY-MM-DD'),'time',to_char(p_time,'HH24:MI'),
    'duration',(v_service->>'duration')::integer,'client',trim(p_client_name),
    'phone',trim(p_client_phone),'service',v_service->>'name','barber',trim(p_barber),
    'price',(v_service->>'price')::numeric,'status','Aguardando'
  ));

  v_clients := coalesce(v_shop.payload->'clients','[]'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_clients) c where c->>'phone'=trim(p_client_phone)) then
    v_clients := v_clients || jsonb_build_array(jsonb_build_object(
      'id',v_id+1,'name',trim(p_client_name),'phone',trim(p_client_phone),
      'lastVisit',to_char(p_date,'YYYY-MM-DD'),'visits',0,'spent',0
    ));
  end if;

  update public.barbershops
  set payload=jsonb_set(jsonb_set(v_shop.payload,'{appointments}',v_appointments,true),'{clients}',v_clients,true),
      updated_at=clock_timestamp()
  where id=v_shop.id;

  return jsonb_build_object('success',true,'appointmentId',v_id);
end
$function$

