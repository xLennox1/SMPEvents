-- pgTAP: Geschäftsregeln (Kontingent, Premium, Rezensionen, Ranking, Zahlungen, Chat-Limits).
-- Ausführen mit `supabase test db` (siehe docs/TESTS.md).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Testdaten (als Superuser)
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@example.test', '{"username":"streamer_a"}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@example.test', '{"username":"player_b"}'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'm@example.test', '{"username":"mod_m"}'),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'x@example.test', '{"username":"admin_x"}'),
  ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 's2@example.test', '{"username":"streamer_two"}'),
  ('66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 's3@example.test', '{"username":"streamer_three"}');
update public.profiles set role = 'moderator' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set role = 'admin'     where id = '44444444-4444-4444-4444-444444444444';
insert into public.streamer_profiles (id, display_name, twitch_url) values
  ('11111111-1111-1111-1111-111111111111', 'Streamer A',     'https://www.twitch.tv/streamer_a'),
  ('55555555-5555-5555-5555-555555555555', 'Streamer Zwei',  'https://www.twitch.tv/streamer_zwei'),
  ('66666666-6666-6666-6666-666666666666', 'Streamer Drei',  'https://www.twitch.tv/streamer_drei');

-- ===================== Kostenloses Kontingent und Premium =====================
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Eins', 'Beschreibung zu Event Eins', 'giveaway', now() + interval '1 day', 'Preis 1')$$, 'kostenloses Event 1');
select lives_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Zwei', 'Beschreibung zu Event Zwei', 'lootdrop', now() + interval '2 days', 'Preis 2')$$, 'kostenloses Event 2');
select lives_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Drei', 'Beschreibung zu Event Drei', 'lootbox', now() + interval '3 days', 'Preis 3')$$, 'kostenloses Event 3');
select throws_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Vier', 'Beschreibung zu Event Vier', 'giveaway', now() + interval '4 days', 'Preis 4')$$,
  'P0001', 'quota_exhausted', 'Nach 3 kostenlosen Events ist ohne Premium keine Veröffentlichung mehr möglich');
select lives_ok($$delete from public.events where title = 'Event Eins'$$, 'Eigene Events lassen sich löschen');
select throws_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Fuenf', 'Beschreibung zu Event Fünf', 'giveaway', now() + interval '5 days', 'Preis 5')$$,
  'P0001', 'quota_exhausted', 'Löschen setzt das Kontingent nicht zurück');
reset role;
select is((select free_events_used from public.streamer_profiles where id = '11111111-1111-1111-1111-111111111111'), 3, 'Der Zähler der kostenlosen Events sinkt nie');

-- aktives Premium: unbegrenzt veröffentlichen, Zähler bleibt unberührt
insert into public.payment_submissions (id, user_id, plan, claimed_amount_coins, payer_ingame_name, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'streamer', 500000, 'Streamer_A', 'approved');
insert into public.subscriptions (user_id, plan, starts_at, expires_at, payment_submission_id)
  values ('11111111-1111-1111-1111-111111111111', 'streamer', now() - interval '1 day', now() + interval '13 days', 'aaaaaaaa-0000-0000-0000-000000000001');
select ok(public.has_active_premium('11111111-1111-1111-1111-111111111111', 'streamer'), 'Aktives Streamer-Abo wird serverseitig erkannt');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Premium', 'Beschreibung mit Premium', 'giveaway', now() + interval '6 days', 'Preis P')$$, 'Mit aktivem Premium sind weitere Events möglich');
reset role;
select is((select free_events_used from public.streamer_profiles where id = '11111111-1111-1111-1111-111111111111'), 3, 'Premium-Events verbrauchen kein Kontingent');

-- abgelaufenes Abo zählt nicht mehr
update public.subscriptions set starts_at = now() - interval '20 days', expires_at = now() - interval '6 days'
  where user_id = '11111111-1111-1111-1111-111111111111';
select ok(not public.has_active_premium('11111111-1111-1111-1111-111111111111', 'streamer'), 'Abgelaufene Abonnements werden serverseitig berücksichtigt');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.events (streamer_id, title, description, category, starts_at, rewards)
  values ('11111111-1111-1111-1111-111111111111', 'Event Sechs', 'Beschreibung zu Event Sechs', 'giveaway', now() + interval '7 days', 'Preis 6')$$,
  'P0001', 'quota_exhausted', 'Nach Ablauf von Premium ist keine neue Veröffentlichung möglich');

-- ===================== Rezensionen =====================
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 5, 'Sehr gut!')$$, 'Eine Rezension abgeben');
select throws_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body)
  values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 4, 'Noch eine')$$,
  '23505', null, 'Pro Nutzer und Streamer ist nur eine Rezension möglich');
select lives_ok($$update public.reviews set rating = 4, body = 'Doch nur gut' where reviewer_id = '22222222-2222-2222-2222-222222222222'$$, 'Die eigene Rezension lässt sich bearbeiten');
select is((select count(*)::int from public.reviews where reviewer_id = '22222222-2222-2222-2222-222222222222'), 1, 'Bearbeiten vervielfältigt Rezensionen nicht');
select throws_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body)
  values ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 6, 'Sechs Sterne')$$,
  '23514', null, 'Sterne müssen zwischen 1 und 5 liegen');
select throws_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body)
  values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 5, 'Im Namen eines anderen')$$,
  '42501', null, 'Rezensionen im Namen anderer sind per RLS gesperrt');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body)
  values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 5, 'Ich bin toll')$$,
  '23514', null, 'Streamer können sich nicht selbst bewerten');
reset role;

-- ===================== Ranking =====================
delete from public.reviews;
insert into public.reviews (streamer_id, reviewer_id, rating, body) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 5, 'Fünf Sterne'),
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 3, 'Drei Sterne'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 4, 'Vier Sterne'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 4, 'Vier Sterne');
select ok((select score is null and rank is null and review_count = 0 from public.streamer_rankings where streamer_id = '55555555-5555-5555-5555-555555555555'),
  'Streamer ohne Rezensionen erhalten keine Punktzahl und keinen Rang (keine künstliche 10/10)');
select is((select score from public.streamer_rankings where streamer_id = '11111111-1111-1111-1111-111111111111'), 8.3,
  'Eine 5-Sterne-Rezension bei Gesamtschnitt 4,0 ergibt 8,3 (v=1, R=5, C=4, m=5), nicht 10');
select is((select rank from public.streamer_rankings where streamer_id = '11111111-1111-1111-1111-111111111111'), 1::bigint, 'Rang 1 vor dem Streamer mit mehr, aber schlechteren Rezensionen');
update public.reviews set status = 'removed' where reviewer_id = '22222222-2222-2222-2222-222222222222' and streamer_id = '11111111-1111-1111-1111-111111111111';
select ok((select score is null from public.streamer_rankings where streamer_id = '11111111-1111-1111-1111-111111111111'), 'Entfernte Rezensionen zählen nicht im Ranking');

-- ===================== Zahlungen =====================
insert into public.payment_submissions (id, user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('bbbbbbbb-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'streamer', 500000, 'Streamer_Zwei');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.approve_payment_submission('bbbbbbbb-0000-0000-0000-000000000001', 500000, 'im Spiel geprüft')$$, 'Admin bestätigt eine Zahlung');
select throws_ok($$select public.approve_payment_submission('bbbbbbbb-0000-0000-0000-000000000001', 500000, 'doppelt')$$,
  'P0001', 'already_decided', 'Eine bereits bestätigte Zahlung kann nicht erneut verbucht werden');
reset role;
select is((select count(*)::int from public.subscriptions where user_id = '55555555-5555-5555-5555-555555555555'), 1, 'Doppelte Bestätigung erzeugt keine doppelte Verlängerung');
select ok(public.has_active_premium('55555555-5555-5555-5555-555555555555', 'streamer'), 'Premium ist nach der Bestätigung aktiv');

insert into public.payment_submissions (id, user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'streamer', 500000, 'Streamer_Zwei');
select throws_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('55555555-5555-5555-5555-555555555555', 'streamer', 500000, 'Streamer_Zwei')$$,
  '23505', null, 'Pro Nutzer und Plan ist nur ein offener Zahlungsantrag möglich');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.approve_payment_submission('bbbbbbbb-0000-0000-0000-000000000002', 499999, 'zu wenig')$$,
  'P0001', 'amount_too_low', 'Ein bestätigter Betrag unter dem Preis wird abgelehnt');
select lives_ok($$select public.approve_payment_submission('bbbbbbbb-0000-0000-0000-000000000002', 500000, 'Verlängerung')$$, 'Admin bestätigt die zweite Zahlung');
reset role;
select is((select max(expires_at) from public.subscriptions where user_id = '55555555-5555-5555-5555-555555555555'), now() + interval '28 days',
  'Die Verlängerung schließt an: 14 + 14 Tage');

-- Spieler-Premium ohne festgelegten Preis ist nicht aktivierbar
insert into public.payment_submissions (id, user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'player', 100, 'Player_B');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.approve_payment_submission('cccccccc-0000-0000-0000-000000000001', 100, null)$$,
  'P0001', 'plan_not_configured', 'Ohne festgelegten Preis lässt sich Spieler-Premium nicht aktivieren');
reset role;

-- ===================== Unbestätigte Minecraft-Meldungen =====================
insert into public.minecraft_payment_events (reported_by, sender_name, recipient_name, amount_coins, currency, raw_message, dedupe_key)
  values ('22222222-2222-2222-2222-222222222222', 'Player_B', 'Empfaenger', 500000, 'Coins', 'Player_B hat Empfaenger 500.000 Coins gesendet', 'test-dedupe-1');
select is((select status::text from public.minecraft_payment_events where dedupe_key = 'test-dedupe-1'), 'unconfirmed', 'Mod-Meldungen sind standardmäßig unbestätigt');
select ok(not public.has_active_premium('22222222-2222-2222-2222-222222222222', 'player'), 'Eine unbestätigte Minecraft-Meldung schaltet Premium nicht frei');
select is((select count(*)::int from public.subscriptions where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'Eine Minecraft-Meldung legt kein Abo an');
select is((select status::text from public.payment_submissions where id = 'cccccccc-0000-0000-0000-000000000001'), 'pending', 'Der Zahlungsantrag bleibt offen, bis ein Admin entscheidet');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$insert into public.minecraft_payment_events (reported_by, raw_message, dedupe_key) values ('22222222-2222-2222-2222-222222222222', 'x', 'k2')$$,
  '42501', null, 'Clients können Mod-Meldungen nicht direkt anlegen (nur der Server mit Secret Key)');
reset role;

-- ===================== Verifizierung =====================
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.verification_requests (streamer_id, note) values ('55555555-5555-5555-5555-555555555555', 'Discord: zwei#0002')$$, 'Verifizierungsantrag stellen');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.decide_verification((select id from public.verification_requests limit 1), true, 'Ticket geprüft')$$, 'Admin verifiziert den Streamer');
reset role;
select ok((select is_verified from public.streamer_profiles where id = '55555555-5555-5555-5555-555555555555'), 'Der blaue Haken wird nach der Admin-Entscheidung gesetzt');
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$update public.streamer_profiles set twitch_url = 'https://www.twitch.tv/anderer_kanal' where id = '55555555-5555-5555-5555-555555555555'$$, 'Kanalwechsel');
reset role;
select ok(not (select is_verified from public.streamer_profiles where id = '55555555-5555-5555-5555-555555555555'), 'Ein Kanalwechsel entzieht den blauen Haken automatisch');

-- ===================== Premium entziehen (Admin) =====================
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.revoke_premium('55555555-5555-5555-5555-555555555555', 'streamer', 'Rückbuchung (Test)')$$, 'Admin entzieht Premium');
reset role;
select ok(not public.has_active_premium('55555555-5555-5555-5555-555555555555', 'streamer'), 'Premium ist nach dem Entzug nicht mehr aktiv');
select ok((select count(*) from public.admin_audit_logs where action = 'premium.revoke') = 1, 'Der Entzug steht im Audit-Log');

-- ===================== Chat-Limits =====================
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm1')$$, 'Chat 1/5');
select lives_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm2')$$, 'Chat 2/5');
select lives_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm3')$$, 'Chat 3/5');
select lives_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm4')$$, 'Chat 4/5');
select lives_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm5')$$, 'Chat 5/5');
select throws_ok($$insert into public.chat_messages (user_id, body) values ('33333333-3333-3333-3333-333333333333', 'm6')$$,
  'P0001', 'rate_limited', 'Flooding: die 6. Nachricht innerhalb von 10 Sekunden wird abgelehnt');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.chat_messages (user_id, body) values ('22222222-2222-2222-2222-222222222222', 'Hallo')$$, 'Erste Nachricht');
select throws_ok($$insert into public.chat_messages (user_id, body) values ('22222222-2222-2222-2222-222222222222', 'Hallo')$$,
  'P0001', 'duplicate_message', 'Spam: identische Nachricht in kurzer Zeit wird abgelehnt');
select throws_ok($$insert into public.chat_messages (user_id, body) values ('22222222-2222-2222-2222-222222222222', repeat('x', 501))$$,
  'P0001', 'invalid_length', 'Zu lange Nachrichten werden abgelehnt');
reset role;

select * from finish();
rollback;
