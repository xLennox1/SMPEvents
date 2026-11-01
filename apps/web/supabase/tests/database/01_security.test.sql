-- pgTAP: Rechte und RLS. Ausführen mit `supabase test db` (siehe docs/TESTS.md).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Testdaten (als Superuser): 1 Streamer, 1 Spieler, 1 Moderator, 1 Admin
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'streamer@example.test', '{"username":"streamer1"}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'player@example.test',   '{"username":"player1"}'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'mod@example.test',      '{"username":"mod1"}'),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'admin@example.test',    '{"username":"admin1"}');
update public.profiles set role = 'moderator' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'admin'     where id = '44444444-4444-4444-4444-444444444444';
insert into public.streamer_profiles (id, display_name, twitch_url)
  values ('11111111-1111-1111-1111-111111111111', 'Streamer One', 'https://www.twitch.tv/streamer_one');

select public.log_admin_action('test.seed', 'test', null, '{}'::jsonb);   -- ein Audit-Eintrag muss existieren, damit "unsichtbar" etwas aussagt
select is((select role::text from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 'moderator', 'Testdaten: Moderator angelegt');

-- ===== als normaler Spieler =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$update public.profiles set bio = 'Hallo' where id = '22222222-2222-2222-2222-222222222222'$$,
  'Nutzer können ihr eigenes Profil bearbeiten');
select is_empty($$update public.profiles set bio = 'gehackt' where id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'Nutzer können keine fremden Profile bearbeiten (RLS: 0 Zeilen)');
select throws_ok($$update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'Normale Nutzer können sich keine Adminrechte geben (Spalte role ist geschützt)');
select throws_ok($$select public.set_user_role('22222222-2222-2222-2222-222222222222', 'admin', 'selbst befördert')$$,
  '42501', 'forbidden', 'set_user_role ist für normale Nutzer gesperrt');
select throws_ok($$insert into public.subscriptions (user_id, plan, starts_at, expires_at, payment_submission_id)
  values ('22222222-2222-2222-2222-222222222222', 'player', now(), now() + interval '14 days', gen_random_uuid())$$,
  '42501', null, 'Nutzer können Premium nicht selbst anlegen');

-- Zahlungsantrag ist erlaubt, die Bestätigung nicht
select lives_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('22222222-2222-2222-2222-222222222222', 'player', 100, 'Player_One')$$, 'Zahlungsantrag einreichen ist erlaubt');
select throws_ok($$update public.payment_submissions set status = 'approved' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'Zahlungsbestätigungen sind für Nutzer nicht änderbar');
select throws_ok($$select public.approve_payment_submission((select id from public.payment_submissions limit 1), 100, null)$$,
  '42501', 'forbidden', 'Premium selbst freischalten per RPC ist gesperrt');

-- Chat: nur eigene Nachrichten
select throws_ok($$insert into public.chat_messages (user_id, body) values ('11111111-1111-1111-1111-111111111111', 'im Namen eines anderen')$$,
  '42501', null, 'Chat: Nachrichten im Namen anderer sind per RLS gesperrt');
select lives_ok($$insert into public.chat_messages (user_id, body) values ('22222222-2222-2222-2222-222222222222', 'Hallo Chat')$$,
  'Chat: eigene Nachricht ist erlaubt');
select is_empty($$select 1 from public.admin_audit_logs$$, 'Audit-Log ist für normale Nutzer unsichtbar');

-- ===== als Streamer =====
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$update public.streamer_profiles set is_verified = true where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'Streamer können sich nicht selbst verifizieren (Spalte is_verified ist geschützt)');
select lives_ok($$insert into public.verification_requests (streamer_id, note) values ('11111111-1111-1111-1111-111111111111', 'Discord: streamer#0001')$$,
  'Ein Verifizierungsantrag ist erlaubt');
select throws_ok($$select public.decide_verification((select id from public.verification_requests limit 1), true, 'selbst genehmigt')$$,
  '42501', 'forbidden', 'Ein Antrag kann nicht vom Streamer selbst genehmigt werden');
select is((select is_verified from public.streamer_profiles where id = '11111111-1111-1111-1111-111111111111'), false,
  'Das Eröffnen eines Antrags (Discord-Ticket) verifiziert nie automatisch');
select lives_ok($$select public.create_mod_token('Test-PC')$$, 'Streamer kann ein Mod-Token erzeugen');
select throws_ok($$update public.events set hidden_at = now()$$, '42501', null, 'Nutzer können Events nicht selbst ausblenden/moderieren');

-- ===== wieder als Spieler: fremde Tokens sind unsichtbar =====
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.mod_ingest_tokens$$, 'Mod-Tokens anderer Nutzer sind unsichtbar');

-- ===== als Moderator: darf moderieren, aber nicht Admin-Funktionen =====
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_user_role('22222222-2222-2222-2222-222222222222', 'moderator', 'test')$$,
  '42501', 'forbidden', 'Moderatoren dürfen keine Rollen vergeben');
select lives_ok($$select public.mute_chat_user('22222222-2222-2222-2222-222222222222', 10, 'Test')$$, 'Moderatoren dürfen Nutzer stummschalten');

-- ===== Stummgeschalteter Spieler =====
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.chat_messages (user_id, body) values ('22222222-2222-2222-2222-222222222222', 'trotzdem schreiben')$$,
  '42501', null, 'Stummgeschaltete Nutzer können nicht schreiben (Berechtigungsprüfung im Chat)');

-- ===== Admin: darf Rollen vergeben, aber nicht die eigene ändern =====
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_user_role('44444444-4444-4444-4444-444444444444', 'user', 'sich selbst degradieren')$$,
  '42501', 'forbidden', 'Auch Admins ändern ihre eigene Rolle nicht');
select lives_ok($$select public.set_user_role('22222222-2222-2222-2222-222222222222', 'moderator', 'Test: befördert')$$, 'Admin darf andere Rollen ändern');
select ok((select count(*) from public.admin_audit_logs where action = 'user.role') = 1, 'Rollenänderung wurde im Audit-Log protokolliert');
select ok((select count(*) from public.admin_audit_logs) >= 2, 'Admins sehen das Audit-Log');

-- ===== anonym: nur lesen =====
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Anonym', 'Anonym darf nichts schreiben', 'giveaway', now(), 'x')$$,
  '42501', null, 'Anonyme Besucher können nichts schreiben');
select lives_ok($$select count(*) from public.streamer_rankings$$, 'Anonyme Besucher können das Ranking lesen');

select * from finish();
rollback;
