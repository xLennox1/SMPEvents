-- SMPEvents · Migration 0005 · Minecraft-Verknüpfung, Empfänger-Token, automatische Zahlungsfreigabe
--
-- Vertrauensmodell: Premium kann automatisch freigegeben werden, aber NUR durch Meldungen eines als "vertrauenswürdig"
-- markierten Mod-Tokens, der einem ADMIN gehört (= die Mod auf deinem Zahlungsempfänger-Konto, die die eingehende
-- Zahlung selbst sieht). Meldungen normaler Spieler bleiben unbestätigte Hinweise. Der Zahler wird über einen per
-- Flüster-Nachricht verifizierten Minecraft-Namen dem Konto zugeordnet, damit niemand fremde Zahlungen beanspruchen kann.

insert into public.app_settings (key, value, description) values
  ('auto_approve_enabled', 'true', 'Automatische Freigabe durch den vertrauenswürdigen Empfänger-Token'),
  ('auto_approve_hint_max_age_minutes', '1440', 'So alt darf ein Zahlungshinweis höchstens sein, um einen später gestellten Antrag zu bestätigen')
on conflict (key) do nothing;

alter table public.mod_ingest_tokens  add column trusted boolean not null default false;
alter table public.payment_submissions add column auto_approved boolean not null default false;

-- ===== Verifizierte Minecraft-Namen =====
create table public.minecraft_links (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  minecraft_name text not null,
  linked_at      timestamptz not null default now(),
  linked_via     text not null default 'whisper' check (linked_via in ('whisper', 'admin')),
  constraint minecraft_links_name_format check (minecraft_name ~ '^[A-Za-z0-9_]{3,16}$')
);
create unique index minecraft_links_name_key on public.minecraft_links (lower(minecraft_name));

create table public.minecraft_link_codes (
  code       text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index minecraft_link_codes_user_idx on public.minecraft_link_codes (user_id, created_at desc);

-- ===== Mod-Tokens: optional "vertrauenswürdig" (nur Admins dürfen das) =====
drop function if exists public.create_mod_token(text);
create or replace function public.create_mod_token(p_label text default 'Minecraft-Mod', p_trusted boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_trusted and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.mod_ingest_tokens t where t.user_id = v_uid and t.revoked_at is null) >= 3 then
    raise exception 'too_many_tokens' using errcode = 'P0001';
  end if;
  v_token := 'smpe_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.mod_ingest_tokens (user_id, label, token_hash, trusted)
  values (v_uid, left(coalesce(nullif(btrim(p_label), ''), 'Minecraft-Mod'), 40),
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_trusted);
  return v_token;
end $$;

-- ===== Verknüpfung per Flüster-Nachricht =====
create or replace function public.create_minecraft_link_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if (select count(*) from public.minecraft_link_codes c where c.user_id = v_uid and c.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  update public.minecraft_link_codes set expires_at = now() where user_id = v_uid and used_at is null and expires_at > now();
  v_code := 'SMPE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.minecraft_link_codes (code, user_id, expires_at) values (v_code, v_uid, now() + interval '15 minutes');
  return v_code;
end $$;

create or replace function public.unlink_minecraft_name() returns void
language sql security definer set search_path = '' as $$
  delete from public.minecraft_links where user_id = (select auth.uid());
$$;

-- Nur der Server (Secret Key) ruft das auf, nachdem der vertrauenswürdige Empfänger-Token die Flüster-Nachricht gemeldet hat.
create or replace function public.link_minecraft_name(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.minecraft_link_codes;
begin
  if p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  select * into c from public.minecraft_link_codes where code = upper(btrim(p_code)) for update;
  if not found or c.used_at is not null or c.expires_at <= now() then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if exists (select 1 from public.minecraft_links l where lower(l.minecraft_name) = lower(p_name) and l.user_id <> c.user_id) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;
  insert into public.minecraft_links (user_id, minecraft_name, linked_via) values (c.user_id, p_name, 'whisper')
  on conflict (user_id) do update set minecraft_name = excluded.minecraft_name, linked_at = now(), linked_via = 'whisper';
  update public.minecraft_link_codes set used_at = now() where code = c.code;
  perform public.log_admin_action('minecraft.link', 'profile', c.user_id::text, jsonb_build_object('name', p_name, 'via', 'whisper'));
  return c.user_id;
end $$;

-- Rückfall, wenn Flüstern auf dem Server nicht geht: Admin verknüpft nach eigener Prüfung.
create or replace function public.admin_link_minecraft_name(p_user uuid, p_name text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.minecraft_links l where lower(l.minecraft_name) = lower(p_name) and l.user_id <> p_user) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;
  insert into public.minecraft_links (user_id, minecraft_name, linked_via) values (p_user, p_name, 'admin')
  on conflict (user_id) do update set minecraft_name = excluded.minecraft_name, linked_at = now(), linked_via = 'admin';
  perform public.log_admin_action('minecraft.link', 'profile', p_user::text,
    jsonb_build_object('name', p_name, 'via', 'admin', 'reason', left(p_reason, 500)));
end $$;

-- ===== Premium vergeben: gemeinsamer Kern für Admin-Freigabe und automatische Freigabe =====
create or replace function public._approve_submission(p_submission_id uuid, p_amount bigint, p_note text, p_auto boolean, p_event_id uuid default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  s public.payment_submissions;
  v_price bigint;
  v_days integer;
  v_base timestamptz;
  v_expiry timestamptz;
begin
  select * into s from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  select (a.value #>> '{}')::bigint  into v_price from public.app_settings a where a.key = s.plan::text || '_premium_price_coins';
  select (a.value #>> '{}')::integer into v_days  from public.app_settings a where a.key = s.plan::text || '_premium_days';
  if v_price is null or v_days is null then raise exception 'plan_not_configured' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < v_price then raise exception 'amount_too_low' using errcode = 'P0001'; end if;

  select greatest(now(), coalesce(max(sub.expires_at), now())) into v_base
    from public.subscriptions sub where sub.user_id = s.user_id and sub.plan = s.plan;
  v_expiry := v_base + make_interval(days => v_days);

  insert into public.subscriptions (user_id, plan, starts_at, expires_at, payment_submission_id, granted_by)
  values (s.user_id, s.plan, v_base, v_expiry, s.id, case when p_auto then null else auth.uid() end);

  update public.payment_submissions
     set status = 'approved',
         decided_by = case when p_auto then null else auth.uid() end,
         decided_at = now(), decision_note = left(p_note, 500),
         verified_amount_coins = p_amount, auto_approved = p_auto
   where id = s.id;

  perform public.log_admin_action(case when p_auto then 'payment.auto_approve' else 'payment.approve' end,
    'payment_submission', s.id::text,
    jsonb_build_object('user_id', s.user_id, 'plan', s.plan, 'verified_amount', p_amount, 'expires_at', v_expiry, 'event_id', p_event_id));
  return v_expiry;
end $$;

create or replace function public.approve_payment_submission(p_submission_id uuid, p_verified_amount bigint, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._approve_submission(p_submission_id, p_verified_amount, p_note, false, null);
end $$;

-- ===== Automatische Zuordnung: Hinweis des Empfänger-Tokens  <->  offener Antrag mit verifiziertem Minecraft-Namen =====
create or replace function public._auto_match_payments(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean := coalesce((select (a.value #>> '{}')::boolean from public.app_settings a where a.key = 'auto_approve_enabled'), false);
  v_recipient text := (select a.value #>> '{}' from public.app_settings a where a.key = 'payment_recipient');
  v_max_age integer := public.setting_int('auto_approve_hint_max_age_minutes', 1440);
  v_price bigint;
  s record;
  h record;
begin
  if not v_enabled or v_recipient is null or btrim(v_recipient) = '' or p_name is null then return; end if;

  for s in
    select ps.id, ps.plan
      from public.payment_submissions ps
      join public.minecraft_links l on l.user_id = ps.user_id
     where ps.status = 'pending' and lower(l.minecraft_name) = lower(p_name)
     order by ps.created_at
  loop
    select (a.value #>> '{}')::bigint into v_price from public.app_settings a where a.key = s.plan::text || '_premium_price_coins';
    if v_price is null then continue; end if;

    select e.id, e.amount_coins into h
      from public.minecraft_payment_events e
      join public.mod_ingest_tokens t on t.id = e.token_id and t.trusted and t.revoked_at is null
      join public.profiles rp on rp.id = t.user_id and rp.role = 'admin'
     where e.status = 'unconfirmed'
       and lower(e.sender_name) = lower(p_name)
       and lower(e.recipient_name) = lower(v_recipient)
       and e.amount_coins >= v_price
       and e.received_at > now() - make_interval(mins => v_max_age)
     order by e.received_at
     limit 1
       for update of e skip locked;
    if not found then continue; end if;

    begin
      perform public._approve_submission(s.id, h.amount_coins, 'automatisch: Zahlung vom Empfänger-Konto gemeldet', true, h.id);
      update public.minecraft_payment_events set status = 'matched', matched_submission_id = s.id where id = h.id;
    exception when others then
      raise warning 'Automatische Freigabe fehlgeschlagen: %', sqlerrm;   -- der Hinweis bleibt unbestätigt, ein Admin kann entscheiden
    end;
  end loop;
end $$;

create or replace function public.trg_hint_auto_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_name is not null and new.recipient_name is not null and new.amount_coins is not null then
    perform public._auto_match_payments(new.sender_name);
  end if;
  return null;
end $$;
create trigger mpe_auto_match after insert on public.minecraft_payment_events
  for each row execute function public.trg_hint_auto_match();

create or replace function public.trg_submission_auto_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select l.minecraft_name into v_name from public.minecraft_links l where l.user_id = new.user_id;
  if v_name is not null then perform public._auto_match_payments(v_name); end if;
  return null;
end $$;
create trigger payment_submissions_auto_match after insert on public.payment_submissions
  for each row execute function public.trg_submission_auto_match();

-- ===== Rechte =====
revoke all on public.minecraft_links, public.minecraft_link_codes from anon, authenticated;
grant select on public.minecraft_links, public.minecraft_link_codes to authenticated;
grant select (trusted) on public.mod_ingest_tokens to authenticated;
alter table public.minecraft_links      enable row level security;
alter table public.minecraft_link_codes enable row level security;
create policy minecraft_links_read on public.minecraft_links for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy minecraft_link_codes_read on public.minecraft_link_codes for select to authenticated
  using (user_id = (select auth.uid()));

revoke execute on function
  public.create_mod_token(text, boolean), public.create_minecraft_link_code(), public.unlink_minecraft_name(),
  public.link_minecraft_name(text, text), public.admin_link_minecraft_name(uuid, text, text),
  public._approve_submission(uuid, bigint, text, boolean, uuid), public.approve_payment_submission(uuid, bigint, text),
  public._auto_match_payments(text), public.trg_hint_auto_match(), public.trg_submission_auto_match()
  from public, anon, authenticated;
grant execute on function
  public.create_mod_token(text, boolean), public.create_minecraft_link_code(), public.unlink_minecraft_name(),
  public.admin_link_minecraft_name(uuid, text, text), public.approve_payment_submission(uuid, bigint, text)
  to authenticated;
grant execute on function public.link_minecraft_name(text, text) to service_role;
