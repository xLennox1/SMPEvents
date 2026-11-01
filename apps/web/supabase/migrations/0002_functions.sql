-- SMPEvents · Migration 0002 · Hilfsfunktionen, Trigger, Admin-/Moderations-RPCs, Ranking-View
-- Alle SECURITY-DEFINER-Funktionen setzen search_path = '' und prüfen Berechtigungen selbst.

-- ===== Rollen, Premium, Einstellungen =====
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('moderator', 'admin'));
$$;

create or replace function public.has_active_premium(p_user uuid, p_plan public.premium_plan) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.plan = p_plan and s.starts_at <= now() and s.expires_at > now()
  );
$$;

create or replace function public.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (a.value #>> '{}')::integer from public.app_settings a where a.key = p_key), p_default);
$$;

create or replace function public.log_admin_action(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ===== Neues Auth-Konto -> Profil (Rolle ist immer 'user'; nie aus Nutzerdaten gelesen) =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_desired text := new.raw_user_meta_data ->> 'username';
  v_name text;
begin
  if v_desired is null or v_desired !~ '^[A-Za-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles p where lower(p.username) = lower(v_desired)) then
    v_name := 'spieler_' || substr(replace(new.id::text, '-', ''), 1, 8);
  else
    v_name := v_desired;
  end if;
  insert into public.profiles (id, username) values (new.id, v_name);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Streamer: Kanalwechsel entzieht den blauen Haken =====
create or replace function public.reset_verification_on_channel_change() returns trigger
language plpgsql as $$
begin
  if new.twitch_url is distinct from old.twitch_url and old.is_verified then
    new.is_verified := false;
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end $$;
create trigger streamer_channel_change before update on public.streamer_profiles
  for each row execute function public.reset_verification_on_channel_change();

-- ===== Events: Kontingent + Premium serverseitig vor JEDER Veröffentlichung =====
create or replace function public.enforce_event_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := public.setting_int('free_events_per_streamer', 3);
  v_used  integer;
begin
  perform (now() at time zone new.timezone);  -- ungültige Zeitzone => Fehler

  -- Zeile sperren: gleichzeitige Inserts können das Kontingent nicht überholen
  select s.free_events_used into v_used from public.streamer_profiles s where s.id = new.streamer_id for update;
  if not found then raise exception 'streamer_not_found' using errcode = 'P0001'; end if;

  if (select count(*) from public.events e where e.streamer_id = new.streamer_id and e.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if public.has_active_premium(new.streamer_id, 'streamer') then
    return new;                                   -- Premium aktiv: unbegrenzt, Kontingent bleibt unberührt
  end if;
  if v_used >= v_limit then
    raise exception 'quota_exhausted' using errcode = 'P0001';
  end if;
  update public.streamer_profiles set free_events_used = free_events_used + 1 where id = new.streamer_id;
  return new;
end $$;
create trigger events_enforce_rules before insert on public.events
  for each row execute function public.enforce_event_rules();

create or replace function public.notify_followers_on_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select f.user_id, 'new_event', 'Neues Event: ' || left(new.title, 100),
         'Ein Streamer, dem du folgst, hat ein Event veröffentlicht.', '/events/' || new.id
    from public.follows f
    join public.profiles p on p.id = f.user_id
   where f.streamer_id = new.streamer_id
     and p.notify_new_events
     and public.has_active_premium(f.user_id, 'player');
  return new;
end $$;
create trigger events_notify_followers after insert on public.events
  for each row execute function public.notify_followers_on_event();

-- Fällige Erinnerungen -> Benachrichtigungen. Aufruf per pg_cron (siehe docs/DEPLOYMENT.md).
create or replace function public.dispatch_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with due as (
    update public.event_reminders r set sent_at = now()
     where r.sent_at is null and r.remind_at <= now()
     returning r.user_id, r.event_id
  ), ins as (
    insert into public.notifications (user_id, kind, title, body, link)
    select d.user_id, 'reminder', 'Erinnerung: ' || left(e.title, 100), 'Das Event beginnt bald.', '/events/' || e.id
      from due d
      join public.events e on e.id = d.event_id
      join public.profiles p on p.id = d.user_id
     where p.notify_reminders and e.hidden_at is null
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

-- ===== Rezensionen, Favoriten, Chat: Limits serverseitig =====
create or replace function public.enforce_review_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reviews r where r.reviewer_id = new.reviewer_id and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger reviews_enforce_rules before insert on public.reviews
  for each row execute function public.enforce_review_rules();

create or replace function public.enforce_favorite_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_active_premium(new.user_id, 'player')
     and (select count(*) from public.favorites f where f.user_id = new.user_id) >= 10 then
    raise exception 'favorite_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger favorites_enforce_limit before insert on public.favorites
  for each row execute function public.enforce_favorite_limit();

create or replace function public.enforce_chat_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.body := btrim(new.body);
  if new.body = '' or char_length(new.body) > 500 then
    raise exception 'invalid_length' using errcode = 'P0001';
  end if;
  -- Flooding: höchstens 5 Nachrichten in 10 Sekunden
  if (select count(*) from public.chat_messages m where m.user_id = new.user_id and m.created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- Spam: identische Nachricht innerhalb von 30 Sekunden
  if exists (select 1 from public.chat_messages m where m.user_id = new.user_id and m.body = new.body and m.created_at > now() - interval '30 seconds') then
    raise exception 'duplicate_message' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger chat_enforce_rules before insert on public.chat_messages
  for each row execute function public.enforce_chat_rules();

-- ===== Rate-Limit-Zähler (nur service_role; für den Mod-Endpunkt) =====
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as rl (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end $$;

-- ===== Mod-Tokens (Klartext wird genau einmal zurückgegeben) =====
create or replace function public.create_mod_token(p_label text default 'Minecraft-Mod') returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if (select count(*) from public.mod_ingest_tokens t where t.user_id = v_uid and t.revoked_at is null) >= 3 then
    raise exception 'too_many_tokens' using errcode = 'P0001';
  end if;
  v_token := 'smpe_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.mod_ingest_tokens (user_id, label, token_hash)
  values (v_uid, left(coalesce(nullif(btrim(p_label), ''), 'Minecraft-Mod'), 40),
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return v_token;
end $$;

create or replace function public.revoke_mod_token(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.mod_ingest_tokens set revoked_at = now()
   where id = p_id and user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- ===== Admin: Verifizierung =====
create or replace function public.decide_verification(p_request_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.verification_requests;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.verification_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  update public.verification_requests
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.decision_status,
         decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 500)
   where id = p_request_id;

  if p_approve then
    update public.streamer_profiles
       set is_verified = true, verified_at = now(), verified_by = auth.uid()
     where id = r.streamer_id;
  end if;
  perform public.log_admin_action(
    case when p_approve then 'verification.approve' else 'verification.reject' end,
    'verification_request', p_request_id::text,
    jsonb_build_object('streamer_id', r.streamer_id, 'note', left(p_note, 500)));
end $$;

create or replace function public.revoke_verification(p_streamer_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.streamer_profiles set is_verified = false, verified_at = null, verified_by = null
   where id = p_streamer_id and is_verified;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action('verification.revoke', 'streamer', p_streamer_id::text,
    jsonb_build_object('reason', left(p_reason, 500)));
end $$;

-- ===== Admin: Zahlungen (manuell geprüft; Aktivierung nur hier, idempotent) =====
create or replace function public.approve_payment_submission(p_submission_id uuid, p_verified_amount bigint, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  s public.payment_submissions;
  v_price bigint;
  v_days integer;
  v_base timestamptz;
  v_expiry timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;

  select (a.value #>> '{}')::bigint  into v_price from public.app_settings a where a.key = s.plan::text || '_premium_price_coins';
  select (a.value #>> '{}')::integer into v_days  from public.app_settings a where a.key = s.plan::text || '_premium_days';
  if v_price is null or v_days is null then raise exception 'plan_not_configured' using errcode = 'P0001'; end if;
  if p_verified_amount is null or p_verified_amount < v_price then raise exception 'amount_too_low' using errcode = 'P0001'; end if;

  -- Verlängerung beginnt nach dem aktuellen Ablauf (oder jetzt, falls abgelaufen)
  select greatest(now(), coalesce(max(sub.expires_at), now())) into v_base
    from public.subscriptions sub where sub.user_id = s.user_id and sub.plan = s.plan;
  v_expiry := v_base + make_interval(days => v_days);

  insert into public.subscriptions (user_id, plan, starts_at, expires_at, payment_submission_id, granted_by)
  values (s.user_id, s.plan, v_base, v_expiry, s.id, auth.uid());   -- UNIQUE(payment_submission_id) verhindert Doppelbuchung

  update public.payment_submissions
     set status = 'approved', decided_by = auth.uid(), decided_at = now(),
         decision_note = left(p_note, 500), verified_amount_coins = p_verified_amount
   where id = s.id;

  perform public.log_admin_action('payment.approve', 'payment_submission', s.id::text,
    jsonb_build_object('user_id', s.user_id, 'plan', s.plan, 'verified_amount', p_verified_amount, 'expires_at', v_expiry));
  return v_expiry;
end $$;

create or replace function public.reject_payment_submission(p_submission_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_note is null or char_length(btrim(p_note)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.payment_submissions
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 500)
   where id = p_submission_id and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action('payment.reject', 'payment_submission', p_submission_id::text,
    jsonb_build_object('note', left(p_note, 500)));
end $$;

-- ===== Moderation =====
create or replace function public.moderate_event(p_event_id uuid, p_hide boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_hide and (p_reason is null or char_length(btrim(p_reason)) < 3) then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.events
     set hidden_at     = case when p_hide then now() else null end,
         hidden_by     = case when p_hide then auth.uid() else null end,
         hidden_reason = case when p_hide then left(p_reason, 500) else null end
   where id = p_event_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action(case when p_hide then 'event.hide' else 'event.unhide' end,
    'event', p_event_id::text, jsonb_build_object('reason', left(p_reason, 500)));
end $$;

-- Negative Rezensionen werden nicht wegen ihrer Bewertung entfernt: Grund ist Pflicht und wird protokolliert.
create or replace function public.moderate_review(p_review_id uuid, p_remove boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.reviews;
begin
  if not public.is_moderator() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_remove and (p_reason is null or char_length(btrim(p_reason)) < 3) then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.reviews
     set status = (case when p_remove then 'removed' else 'active' end)::public.record_status,
         moderated_by = auth.uid(), moderated_at = now(),
         moderation_reason = case when p_remove then left(p_reason, 500) else null end
   where id = p_review_id
   returning * into v_row;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.review_reports set status = 'actioned', handled_by = auth.uid(), handled_at = now()
   where review_id = p_review_id and status = 'open';
  perform public.log_admin_action(case when p_remove then 'review.remove' else 'review.restore' end,
    'review', p_review_id::text,
    jsonb_build_object('streamer_id', v_row.streamer_id, 'reviewer_id', v_row.reviewer_id,
                       'rating', v_row.rating, 'reason', left(p_reason, 500)));
end $$;

create or replace function public.report_review(p_review_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.reviews;
  v_reason text := btrim(p_reason);
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then raise exception 'invalid_reason' using errcode = 'P0001'; end if;
  if (select count(*) from public.review_reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select * into v_row from public.reviews where id = p_review_id and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.review_reports (review_id, review_author_id, review_snapshot, reporter_id, reason)
  values (v_row.id, v_row.reviewer_id, v_row.rating || '/5: ' || v_row.body, v_uid, v_reason)
  on conflict (review_id, reporter_id) do nothing;
end $$;

create or replace function public.report_chat_message(p_message_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
  v_reason text := btrim(p_reason);
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then raise exception 'invalid_reason' using errcode = 'P0001'; end if;
  if (select count(*) from public.chat_reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.chat_reports (message_id, message_author_id, message_snapshot, reporter_id, reason)
  values (v_msg.id, v_msg.user_id, v_msg.body, v_uid, v_reason)
  on conflict (message_id, reporter_id) do nothing;
end $$;

create or replace function public.dismiss_report(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'chat' then
    update public.chat_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now()
     where id = p_id and status = 'open';
  elsif p_kind = 'review' then
    update public.review_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now()
     where id = p_id and status = 'open';
  else
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action('report.dismiss', p_kind || '_report', p_id::text, '{}'::jsonb);
end $$;

create or replace function public.edit_chat_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_body text := btrim(p_body);
begin
  if v_body is null or v_body = '' or char_length(v_body) > 500 then raise exception 'invalid_length' using errcode = 'P0001'; end if;
  update public.chat_messages set body = v_body, edited_at = now()
   where id = p_id and user_id = auth.uid() and created_at > now() - interval '5 minutes';
  if not found then raise exception 'not_editable' using errcode = 'P0001'; end if;
end $$;

create or replace function public.delete_chat_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_msg public.chat_messages;
begin
  select * into v_msg from public.chat_messages where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_msg.user_id = auth.uid() then
    delete from public.chat_messages where id = p_id;
  elsif public.is_moderator() then
    -- Reports zuerst abschließen (message_id wird beim Löschen auf NULL gesetzt)
    update public.chat_reports set status = 'actioned', handled_by = auth.uid(), handled_at = now()
     where message_id = p_id and status = 'open';
    delete from public.chat_messages where id = p_id;
    perform public.log_admin_action('chat.delete', 'chat_message', p_id::text,
      jsonb_build_object('author_id', v_msg.user_id, 'body', v_msg.body));
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public.mute_chat_user(p_user uuid, p_minutes integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 43200 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  if exists (select 1 from public.profiles p where p.id = p_user and p.role in ('moderator', 'admin')) and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles
     set chat_muted_until = case when p_minutes = 0 then null else now() + make_interval(mins => p_minutes) end
   where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action(case when p_minutes = 0 then 'chat.unmute' else 'chat.mute' end,
    'profile', p_user::text, jsonb_build_object('minutes', p_minutes, 'reason', left(p_reason, 300)));
end $$;

-- ===== Streamer-Ranking (Bayes-gewichtet; Quelle der Wahrheit, siehe docs/RANKING.md) =====
--   W = v/(v+m) * R + m/(v+m) * C      Punktzahl = round(W * 2, 1)
--   R = Durchschnitt des Streamers, v = Anzahl aktiver Rezensionen,
--   C = Durchschnitt ALLER aktiven Rezensionen, m = app_settings.ranking_m
create or replace view public.streamer_rankings with (security_invoker = true) as
with cfg as (
  select coalesce((select (a.value #>> '{}')::numeric from public.app_settings a where a.key = 'ranking_m'), 5) as m
), glob as (
  select coalesce(avg(r.rating), 0)::numeric as c from public.reviews r where r.status = 'active'
), agg as (
  select s.id as streamer_id,
         count(r.id)::integer as review_count,
         avg(r.rating)::numeric as avg_rating
    from public.streamer_profiles s
    left join public.reviews r on r.streamer_id = s.id and r.status = 'active'
   group by s.id
), scored as (
  select a.streamer_id, a.review_count, a.avg_rating, g.c as global_avg, cfg.m,
         case when a.review_count > 0
              then (a.review_count / (a.review_count + cfg.m)) * a.avg_rating
                 + (cfg.m / (a.review_count + cfg.m)) * g.c
         end as weighted_rating
    from agg a cross join glob g cross join cfg
)
select sc.streamer_id,
       s.display_name,
       p.avatar_url,
       s.is_verified,
       s.created_at,
       sc.review_count,
       round(sc.avg_rating, 2)            as avg_rating,
       round(sc.global_avg, 3)            as global_avg,
       sc.m,
       round(sc.weighted_rating, 3)       as weighted_rating,
       round(sc.weighted_rating * 2, 1)   as score,
       case when sc.weighted_rating is not null
            then rank() over (partition by (sc.weighted_rating is null)
                              order by sc.weighted_rating desc, sc.review_count desc)
       end as rank
  from scored sc
  join public.streamer_profiles s on s.id = sc.streamer_id
  join public.profiles p on p.id = sc.streamer_id;

-- ===== Ausführungsrechte: standardmäßig niemand, dann gezielt freigeben =====
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin(), public.is_moderator(), public.setting_int(text, integer)
  to anon, authenticated;
grant execute on function public.has_active_premium(uuid, public.premium_plan) to authenticated;
grant execute on function
  public.create_mod_token(text), public.revoke_mod_token(uuid),
  public.decide_verification(uuid, boolean, text), public.revoke_verification(uuid, text),
  public.approve_payment_submission(uuid, bigint, text), public.reject_payment_submission(uuid, text),
  public.moderate_event(uuid, boolean, text), public.moderate_review(uuid, boolean, text),
  public.report_review(uuid, text), public.report_chat_message(uuid, text), public.dismiss_report(text, uuid),
  public.edit_chat_message(uuid, text), public.delete_chat_message(uuid), public.mute_chat_user(uuid, integer, text)
  to authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
