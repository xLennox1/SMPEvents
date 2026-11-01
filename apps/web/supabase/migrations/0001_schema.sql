-- SMPEvents · Migration 0001 · Typen, Tabellen, Indizes, Constraints
-- Reihenfolge: 0001 Schema -> 0002 Funktionen/Trigger/Views -> 0003 Rechte, RLS, Storage, Realtime

-- ---------- Typen ----------
create type public.app_role        as enum ('user', 'moderator', 'admin');
create type public.event_category  as enum ('giveaway', 'lootdrop', 'lootbox');
create type public.event_status    as enum ('scheduled', 'live', 'ended');
create type public.record_status   as enum ('active', 'removed');
create type public.report_status   as enum ('open', 'actioned', 'dismissed');
create type public.decision_status as enum ('pending', 'approved', 'rejected');
create type public.premium_plan    as enum ('streamer', 'player');
create type public.hint_status     as enum ('unconfirmed', 'matched', 'dismissed');

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Einstellungen (öffentlich lesbar, nur per Admin/SQL änderbar) ----------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (key, value, description) values
  ('free_events_per_streamer',     '3',      'Kostenlose Event-Veröffentlichungen pro Streamer'),
  ('streamer_premium_price_coins', '500000', 'Preis Streamer-Premium in WindSMP-Coins'),
  ('streamer_premium_days',        '14',     'Laufzeit Streamer-Premium in Tagen'),
  ('ranking_m',                    '5',      'Mindestgewichtung m der Bayes-Formel (Streamer-Ranking)'),
  ('payment_recipient',            '""',     'In-Game-Name des Zahlungsempfängers – bewusst leer, vom Betreiber zu setzen'),
  ('payment_instructions',         '""',     'Zahlungsanleitung für die Premium-Seite (Freitext)');
-- Spieler-Premium: Preis und Laufzeit sind noch nicht festgelegt. Zum Aktivieren:
--   insert into public.app_settings (key, value) values
--     ('player_premium_price_coins', '<Preis>'), ('player_premium_days', '<Tage>');

-- ---------- Profile ----------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text not null,
  avatar_url        text,
  bio               text,
  twitch_url        text,
  role              public.app_role not null default 'user',
  chat_muted_until  timestamptz,
  notify_new_events boolean not null default true,
  notify_reminders  boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 300),
  constraint profiles_twitch_url_format check (twitch_url is null or twitch_url ~* '^https://(www\.)?twitch\.tv/[a-z0-9_]{3,25}/?$'),
  constraint profiles_avatar_https check (avatar_url is null or avatar_url ~ '^https://')
);
create unique index profiles_username_lower_key on public.profiles (lower(username));
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Streamer-Profile (id = Nutzer-ID) ----------
create table public.streamer_profiles (
  id               uuid primary key references public.profiles (id) on delete cascade,
  display_name     text not null,
  description      text,
  twitch_url       text not null,
  is_verified      boolean not null default false,
  verified_at      timestamptz,
  verified_by      uuid references public.profiles (id) on delete set null,
  free_events_used integer not null default 0,  -- sinkt nie: Löschen von Events setzt das Kontingent nicht zurück
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint streamer_display_name_len check (char_length(btrim(display_name)) between 2 and 40),
  constraint streamer_description_len check (description is null or char_length(description) <= 1000),
  constraint streamer_twitch_url_format check (twitch_url ~* '^https://(www\.)?twitch\.tv/[a-z0-9_]{3,25}/?$'),
  constraint streamer_free_events_nonneg check (free_events_used >= 0)
);
-- Ein Twitch-Kanal darf nur einem Streamer-Profil gehören (Schutz vor Doppelgängern)
create unique index streamer_twitch_channel_key on public.streamer_profiles
  (lower(regexp_replace(twitch_url, '^https://(www\.)?twitch\.tv/|/$', '', 'g')));
create trigger streamer_profiles_touch before update on public.streamer_profiles
  for each row execute function public.touch_updated_at();

-- ---------- Events ----------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  streamer_id   uuid not null references public.streamer_profiles (id) on delete cascade,
  title         text not null,
  description   text not null,
  category      public.event_category not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  timezone      text not null default 'Europe/Berlin',
  rewards       text not null,
  conditions    text,
  link_url      text,
  status        public.event_status not null default 'scheduled',
  hidden_at     timestamptz,
  hidden_by     uuid references public.profiles (id) on delete set null,
  hidden_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_title_len check (char_length(btrim(title)) between 3 and 100),
  constraint events_description_len check (char_length(btrim(description)) between 10 and 2000),
  constraint events_rewards_len check (char_length(btrim(rewards)) between 1 and 500),
  constraint events_conditions_len check (conditions is null or char_length(conditions) <= 1000),
  constraint events_link_https check (link_url is null or link_url ~ '^https://[^[:space:]]+$'),
  constraint events_end_after_start check (ends_at is null or ends_at > starts_at),
  constraint events_timezone_len check (char_length(timezone) between 3 and 64)
);
create index events_starts_at_idx on public.events (starts_at) where hidden_at is null;
create index events_streamer_idx  on public.events (streamer_id, starts_at desc);
create index events_category_idx  on public.events (category, starts_at) where hidden_at is null;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------- Rezensionen ----------
create table public.reviews (
  id                uuid primary key default gen_random_uuid(),
  streamer_id       uuid not null references public.streamer_profiles (id) on delete cascade,
  reviewer_id       uuid not null references public.profiles (id) on delete cascade,
  rating            smallint not null check (rating between 1 and 5),
  body              text not null,
  status            public.record_status not null default 'active',
  moderated_by      uuid references public.profiles (id) on delete set null,
  moderated_at      timestamptz,
  moderation_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reviews_body_len check (char_length(btrim(body)) between 3 and 1000),
  constraint reviews_no_self_review check (reviewer_id <> streamer_id),
  constraint reviews_one_per_streamer unique (reviewer_id, streamer_id)
);
create index reviews_streamer_idx on public.reviews (streamer_id) where status = 'active';
create index reviews_created_idx  on public.reviews (created_at desc);
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ---------- Favoriten, Folgen, Erinnerungen, Benachrichtigungen ----------
create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.follows (            -- Premium: Benachrichtigung bei neuen Events eines Streamers
  user_id     uuid not null references public.profiles (id) on delete cascade,
  streamer_id uuid not null references public.streamer_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, streamer_id)
);

create table public.event_reminders (    -- Premium
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  remind_at  timestamptz not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_reminders_due_idx on public.event_reminders (remind_at) where sent_at is null;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- Chat "SMPEvents Chatall" ----------
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  constraint chat_body_len check (char_length(body) between 1 and 500)
);
create index chat_messages_created_idx on public.chat_messages (created_at desc);
create index chat_messages_user_idx    on public.chat_messages (user_id, created_at desc);

create table public.chat_reports (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid references public.chat_messages (id) on delete set null,
  message_author_id uuid references public.profiles (id) on delete set null,
  message_snapshot  text not null,
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reason            text not null,
  status            public.report_status not null default 'open',
  handled_by        uuid references public.profiles (id) on delete set null,
  handled_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint chat_reports_reason_len check (char_length(btrim(reason)) between 3 and 300),
  unique (message_id, reporter_id)
);
create index chat_reports_status_idx on public.chat_reports (status, created_at desc);

create table public.review_reports (
  id                uuid primary key default gen_random_uuid(),
  review_id         uuid references public.reviews (id) on delete set null,
  review_author_id  uuid references public.profiles (id) on delete set null,
  review_snapshot   text not null,
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reason            text not null,
  status            public.report_status not null default 'open',
  handled_by        uuid references public.profiles (id) on delete set null,
  handled_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint review_reports_reason_len check (char_length(btrim(reason)) between 3 and 300),
  unique (review_id, reporter_id)
);
create index review_reports_status_idx on public.review_reports (status, created_at desc);

-- ---------- Verifizierung ----------
create table public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  streamer_id   uuid not null references public.streamer_profiles (id) on delete cascade,
  note          text,                       -- z. B. Discord-Name für das Ticket
  status        public.decision_status not null default 'pending',
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  constraint verification_note_len check (note is null or char_length(note) <= 500)
);
create unique index verification_one_pending_key on public.verification_requests (streamer_id)
  where status = 'pending';

-- ---------- Zahlungen & Premium ----------
create table public.payment_submissions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  plan                  public.premium_plan not null,
  claimed_amount_coins  bigint not null check (claimed_amount_coins > 0),
  payer_ingame_name     text not null,
  note                  text,
  proof_path            text,
  status                public.decision_status not null default 'pending',
  verified_amount_coins bigint,
  decided_by            uuid references public.profiles (id) on delete set null,
  decided_at            timestamptz,
  decision_note         text,
  created_at            timestamptz not null default now(),
  constraint payment_name_format check (payer_ingame_name ~ '^[A-Za-z0-9_]{3,16}$'),
  constraint payment_note_len check (note is null or char_length(note) <= 500)
);
-- Schutz gegen doppelte Buchungen: pro Nutzer und Plan nur ein offener Antrag
create unique index payment_one_pending_key on public.payment_submissions (user_id, plan)
  where status = 'pending';
create index payment_status_idx on public.payment_submissions (status, created_at desc);

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  plan                  public.premium_plan not null,
  starts_at             timestamptz not null,
  expires_at            timestamptz not null,
  -- UNIQUE: eine bestätigte Zahlung kann nur genau einmal Premium auslösen
  payment_submission_id uuid not null unique references public.payment_submissions (id) on delete restrict,
  granted_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint subscriptions_period check (expires_at > starts_at)
);
create index subscriptions_user_idx on public.subscriptions (user_id, plan, expires_at desc);

-- ---------- Minecraft-Mod: Tokens und unbestätigte Zahlungs-Hinweise ----------
create table public.mod_ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  label        text not null default 'Minecraft-Mod',
  token_hash   text not null unique,        -- nur SHA-256-Hash, Klartext wird nie gespeichert
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index mod_tokens_user_idx on public.mod_ingest_tokens (user_id);

create table public.minecraft_payment_events (
  id                      uuid primary key default gen_random_uuid(),
  reported_by             uuid not null references public.profiles (id) on delete cascade,
  token_id                uuid references public.mod_ingest_tokens (id) on delete set null,
  sender_name             text,             -- NULL = nicht zuverlässig erkannt
  recipient_name          text,
  amount_coins            bigint,
  currency                text,
  raw_message             text not null,
  pattern_id              text,
  mod_version             text,
  observed_at             timestamptz,
  received_at             timestamptz not null default now(),
  status                  public.hint_status not null default 'unconfirmed',
  dedupe_key              text not null unique,
  matched_submission_id   uuid references public.payment_submissions (id) on delete set null,
  constraint mpe_raw_len check (char_length(raw_message) <= 512)
);
create index mpe_status_idx on public.minecraft_payment_events (status, received_at desc);

-- ---------- Audit-Log & Rate-Limits ----------
create table public.admin_audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_created_idx on public.admin_audit_logs (created_at desc);

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);
