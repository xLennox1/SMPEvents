-- SMPEvents · Migration 0003 · Tabellenrechte, Row Level Security, Storage, Realtime
-- Prinzip: erst alles entziehen, dann gezielt (spaltengenau) freigeben. Geschützte Felder
-- (Rolle, Verifizierung, Kontingent, Moderation, Status von Zahlungen) sind für Clients nie schreibbar.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- Tabellenrechte ----------
grant select on public.app_settings to anon, authenticated;

grant select (id, username, avatar_url, bio, twitch_url, role, created_at) on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update (username, avatar_url, bio, twitch_url, notify_new_events, notify_reminders) on public.profiles to authenticated;

grant select on public.streamer_profiles to anon, authenticated;
grant insert (id, display_name, description, twitch_url) on public.streamer_profiles to authenticated;
grant update (display_name, description, twitch_url) on public.streamer_profiles to authenticated;

grant select on public.events to anon, authenticated;
grant insert (streamer_id, title, description, category, starts_at, ends_at, timezone, rewards, conditions, link_url)
  on public.events to authenticated;
grant update (title, description, category, starts_at, ends_at, timezone, rewards, conditions, link_url, status)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant select on public.reviews to anon, authenticated;
grant insert (streamer_id, reviewer_id, rating, body) on public.reviews to authenticated;
grant update (rating, body) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

grant select, delete on public.favorites to authenticated;
grant insert (user_id, event_id) on public.favorites to authenticated;
grant select, delete on public.follows to authenticated;
grant insert (user_id, streamer_id) on public.follows to authenticated;
grant select, delete on public.event_reminders to authenticated;
grant insert (user_id, event_id, remind_at) on public.event_reminders to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select on public.chat_messages to authenticated;
grant insert (user_id, body) on public.chat_messages to authenticated;   -- Edit/Delete nur per RPC

grant select on public.chat_reports, public.review_reports to authenticated;   -- Anlegen nur per RPC

grant select on public.verification_requests to authenticated;
grant insert (streamer_id, note) on public.verification_requests to authenticated;

grant select on public.subscriptions to authenticated;                          -- schreiben nur per Admin-RPC
grant select on public.payment_submissions to authenticated;
grant insert (user_id, plan, claimed_amount_coins, payer_ingame_name, note, proof_path)
  on public.payment_submissions to authenticated;

grant select on public.minecraft_payment_events to authenticated;               -- schreiben nur Server (Secret Key)
grant select (id, user_id, label, created_at, last_used_at, revoked_at) on public.mod_ingest_tokens to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant select on public.streamer_rankings to anon, authenticated;
-- rate_limits: bewusst keine Rechte für anon/authenticated

-- ---------- Row Level Security aktivieren ----------
alter table public.app_settings              enable row level security;
alter table public.profiles                  enable row level security;
alter table public.streamer_profiles         enable row level security;
alter table public.events                    enable row level security;
alter table public.reviews                   enable row level security;
alter table public.favorites                 enable row level security;
alter table public.follows                   enable row level security;
alter table public.event_reminders           enable row level security;
alter table public.notifications             enable row level security;
alter table public.chat_messages             enable row level security;
alter table public.chat_reports              enable row level security;
alter table public.review_reports            enable row level security;
alter table public.verification_requests     enable row level security;
alter table public.payment_submissions       enable row level security;
alter table public.subscriptions             enable row level security;
alter table public.mod_ingest_tokens         enable row level security;
alter table public.minecraft_payment_events  enable row level security;
alter table public.admin_audit_logs          enable row level security;
alter table public.rate_limits               enable row level security;

-- ---------- Policies ----------
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);

create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy streamers_read on public.streamer_profiles for select to anon, authenticated using (true);
create policy streamers_insert_own on public.streamer_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy streamers_update_own on public.streamer_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy events_read on public.events for select to anon, authenticated
  using (hidden_at is null or streamer_id = (select auth.uid()) or public.is_moderator());
create policy events_insert_own on public.events for insert to authenticated
  with check (streamer_id = (select auth.uid()));
create policy events_update_own on public.events for update to authenticated
  using (streamer_id = (select auth.uid())) with check (streamer_id = (select auth.uid()));
create policy events_update_mod on public.events for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
create policy events_delete on public.events for delete to authenticated
  using (streamer_id = (select auth.uid()) or public.is_moderator());

create policy reviews_read on public.reviews for select to anon, authenticated
  using (status = 'active' or reviewer_id = (select auth.uid()) or public.is_moderator());
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (reviewer_id = (select auth.uid()));
create policy reviews_update_own on public.reviews for update to authenticated
  using (reviewer_id = (select auth.uid()) and status = 'active')
  with check (reviewer_id = (select auth.uid()) and status = 'active');
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (reviewer_id = (select auth.uid()));

create policy favorites_own_read on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_own_insert on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorites_own_delete on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

-- Folgen und Erinnerungen sind Premium-Funktionen (serverseitig erzwungen)
create policy follows_own_read on public.follows for select to authenticated using (user_id = (select auth.uid()));
create policy follows_own_insert on public.follows for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_active_premium((select auth.uid()), 'player'));
create policy follows_own_delete on public.follows for delete to authenticated using (user_id = (select auth.uid()));

create policy reminders_own_read on public.event_reminders for select to authenticated using (user_id = (select auth.uid()));
create policy reminders_own_insert on public.event_reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and remind_at > now() and public.has_active_premium((select auth.uid()), 'player'));
create policy reminders_own_delete on public.event_reminders for delete to authenticated using (user_id = (select auth.uid()));

create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy chat_read on public.chat_messages for select to authenticated using (true);
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.chat_muted_until > now())
  );

create policy chat_reports_mod_read on public.chat_reports for select to authenticated using (public.is_moderator());
create policy review_reports_mod_read on public.review_reports for select to authenticated using (public.is_moderator());

create policy verification_read on public.verification_requests for select to authenticated
  using (streamer_id = (select auth.uid()) or public.is_admin());
create policy verification_insert_own on public.verification_requests for insert to authenticated
  with check (streamer_id = (select auth.uid()));

create policy subscriptions_read on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy payments_read on public.payment_submissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy payments_insert_own on public.payment_submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (plan = 'player' or exists (select 1 from public.streamer_profiles s where s.id = (select auth.uid())))
    and (proof_path is null or proof_path like (select auth.uid())::text || '/%')
  );

create policy mpe_read on public.minecraft_payment_events for select to authenticated
  using (reported_by = (select auth.uid()) or public.is_admin());
create policy mod_tokens_own_read on public.mod_ingest_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (public.is_admin());
-- rate_limits: RLS an, keine Policy => nur service_role (umgeht RLS) kommt heran.

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',        'avatars',        true,  1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy proofs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy proofs_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------- Realtime (Chat + Benachrichtigungen) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages, public.notifications;
  end if;
end $$;
