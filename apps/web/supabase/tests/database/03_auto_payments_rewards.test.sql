-- pgTAP: automatische Zahlungsfreigabe (Empfänger-Token), Minecraft-Verknüpfung, Punkte, Creator-Codes, Shop.
-- Ausführen mit `supabase test db` (siehe docs/TESTS.md).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Testdaten: Admin (Empfänger-Konto), Zahler P, Hochstapler Q, Zahler R (zahlt zuerst), verifizierter Streamer V, Käufer B
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@example.test', '{"username":"admin_a"}'),
  ('b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'p@example.test',     '{"username":"zahler_p"}'),
  ('c3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'q@example.test',     '{"username":"hochstapler_q"}'),
  ('d4444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'r@example.test',     '{"username":"zahler_r"}'),
  ('e5555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'v@example.test',     '{"username":"streamer_v"}'),
  ('f6666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'b@example.test',     '{"username":"kaeufer_b"}');
update public.profiles set role = 'admin' where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.streamer_profiles (id, display_name, twitch_url) values
  ('b2222222-2222-2222-2222-222222222222', 'Zahler P',      'https://www.twitch.tv/zahler_p'),
  ('c3333333-3333-3333-3333-333333333333', 'Hochstapler Q', 'https://www.twitch.tv/hochstapler_q'),
  ('d4444444-4444-4444-4444-444444444444', 'Zahler R',      'https://www.twitch.tv/zahler_r'),
  ('e5555555-5555-5555-5555-555555555555', 'Streamer V',    'https://www.twitch.tv/streamer_v');
update public.streamer_profiles set is_verified = true where id = 'e5555555-5555-5555-5555-555555555555';
update public.app_settings set value = to_jsonb('Empfaenger_Konto'::text) where key = 'payment_recipient';

-- ===================== Tokens: nur Admins dürfen vertrauenswürdige Tokens erzeugen =====================
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_mod_token('Fake-Empfänger', true)$$, '42501', 'forbidden', 'Normale Nutzer können keinen vertrauenswürdigen Token erzeugen');
select lives_ok($$select public.create_mod_token('Mein PC')$$, 'Normale Nutzer erzeugen normale Tokens');
reset role;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_mod_token('Empfänger-Konto', true)$$, 'Admins erzeugen den Empfänger-Token');
reset role;
select ok((select trusted from public.mod_ingest_tokens where user_id = 'a1111111-1111-1111-1111-111111111111'), 'Der Empfänger-Token ist als vertrauenswürdig markiert');
select ok(not (select trusted from public.mod_ingest_tokens where user_id = 'b2222222-2222-2222-2222-222222222222'), 'Normale Tokens sind nie vertrauenswürdig');

-- ===================== Minecraft-Verknüpfung per Flüster-Code =====================
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_minecraft_link_code()$$, 'P erzeugt einen Verknüpfungscode');
select throws_ok($$select public.link_minecraft_name('SMPE-00000000', 'Irgendwer')$$, '42501', null, 'Clients können die Verknüpfungs-Funktion nicht selbst aufrufen (nur der Server)');
reset role;
select throws_ok($$select public.link_minecraft_name('SMPE-00000000', 'Payer_One')$$, 'P0001', 'invalid_code', 'Ein unbekannter Code verknüpft nichts');
select lives_ok($$select public.link_minecraft_name((select code from public.minecraft_link_codes where user_id = 'b2222222-2222-2222-2222-222222222222' and used_at is null), 'Payer_One')$$, 'Der richtige Code verknüpft den Namen');
select is((select minecraft_name from public.minecraft_links where user_id = 'b2222222-2222-2222-2222-222222222222'), 'Payer_One', 'P ist mit Payer_One verknüpft');
select throws_ok($$select public.link_minecraft_name((select code from public.minecraft_link_codes where user_id = 'b2222222-2222-2222-2222-222222222222' limit 1), 'Payer_One')$$, 'P0001', 'invalid_code', 'Ein Code ist nur einmal verwendbar');
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_minecraft_link_code()$$, 'Q erzeugt ebenfalls einen Code');
reset role;
select throws_ok($$select public.link_minecraft_name((select code from public.minecraft_link_codes where user_id = 'c3333333-3333-3333-3333-333333333333' and used_at is null), 'payer_one')$$, 'P0001', 'name_taken', 'Ein bereits verknüpfter Name (auch in anderer Schreibweise) lässt sich nicht erneut beanspruchen');

-- ===================== Automatische Freigabe =====================
-- Q (nicht verknüpft) behauptet, Payer_One zu sein; P kündigt seine Zahlung an
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('c3333333-3333-3333-3333-333333333333', 'streamer', 500000, 'Payer_One')$$, 'Q reicht einen Antrag mit fremdem Namen ein');
reset role;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('b2222222-2222-2222-2222-222222222222', 'streamer', 500000, 'Payer_One')$$, 'P kündigt die Zahlung an');
reset role;
select is((select status::text from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222'), 'pending', 'Ohne Zahlung bleibt der Antrag offen');

-- 1) Hinweis eines NORMALEN Tokens: nie automatische Freigabe
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, currency, raw_message, dedupe_key)
  values ('b2222222-2222-2222-2222-222222222222', (select id from public.mod_ingest_tokens where user_id = 'b2222222-2222-2222-2222-222222222222'),
          'Payer_One', 'Empfaenger_Konto', 500000, 'Coins', 'Payer_One hat Empfaenger_Konto 500.000 Coins gesendet', 'k-untrusted');
select is((select status::text from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222'), 'pending', 'Meldung eines normalen Spielers schaltet nichts frei (auch nicht die eigene Zahlung)');

-- 2) vertrauenswürdiger Token, aber falsche Daten: kein Treffer
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, v.sender, v.recipient, v.amount, 'Testzeile', v.k
  from public.mod_ingest_tokens t,
       (values ('Payer_One', 'Anderer_Empfaenger', 500000::bigint, 'k-wrong-recipient'),
               ('Payer_One', 'Empfaenger_Konto',   499999::bigint, 'k-too-low'),
               ('Fremder',   'Empfaenger_Konto',   500000::bigint, 'k-unknown-sender')) as v(sender, recipient, amount, k)
 where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select status::text from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222'), 'pending', 'Falscher Empfänger, zu wenig Betrag oder unbekannter Absender lösen nichts aus');
select is((select status::text from public.payment_submissions where user_id = 'c3333333-3333-3333-3333-333333333333'), 'pending', 'Ein fremder Name im Antrag zählt nicht (nur verifizierte Namen)');

-- 3) passender Hinweis des Empfänger-Tokens: automatische Freigabe
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, currency, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, 'Payer_One', 'Empfaenger_Konto', 500000, 'Coins', 'Payer_One hat dir 500.000 Coins gesendet', 'k-trusted-ok'
  from public.mod_ingest_tokens t where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select status::text from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222'), 'approved', 'Der Hinweis des Empfänger-Tokens gibt Premium automatisch frei');
select ok((select auto_approved and decided_by is null from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222'), 'Als automatisch bestätigt markiert');
select ok(public.has_active_premium('b2222222-2222-2222-2222-222222222222', 'streamer'), 'Premium ist aktiv');
select is((select status::text from public.minecraft_payment_events where dedupe_key = 'k-trusted-ok'), 'matched', 'Der Hinweis ist verbraucht (matched)');
select is((select status::text from public.payment_submissions where user_id = 'c3333333-3333-3333-3333-333333333333'), 'pending', 'Der Hochstapler bekommt nichts');
select ok(not public.has_active_premium('c3333333-3333-3333-3333-333333333333', 'streamer'), 'Der Hochstapler hat kein Premium');
select ok((select count(*) from public.admin_audit_logs where action = 'payment.auto_approve') = 1, 'Die automatische Freigabe steht im Audit-Log');

-- 4) doppelte Zahlung: keine zweite Verlängerung ohne neuen Antrag
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, 'Payer_One', 'Empfaenger_Konto', 500000, 'Testzeile', 'k-trusted-dup'
  from public.mod_ingest_tokens t where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.subscriptions where user_id = 'b2222222-2222-2222-2222-222222222222'), 1, 'Eine doppelte Zahlungsmeldung erzeugt keine doppelte Verlängerung');

-- 5) zuerst bezahlen, danach ankündigen
select set_config('request.jwt.claims', '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.create_minecraft_link_code()$$, 'R erzeugt einen Code');
reset role;
select lives_ok($$select public.link_minecraft_name((select code from public.minecraft_link_codes where user_id = 'd4444444-4444-4444-4444-444444444444' and used_at is null), 'Payer_Two')$$, 'R ist mit Payer_Two verknüpft');
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, 'Payer_Two', 'Empfaenger_Konto', 500000, 'Testzeile', 'k-pay-first'
  from public.mod_ingest_tokens t where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select status::text from public.minecraft_payment_events where dedupe_key = 'k-pay-first'), 'unconfirmed', 'Ohne Antrag bleibt der Hinweis zunächst unbestätigt');
select set_config('request.jwt.claims', '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('d4444444-4444-4444-4444-444444444444', 'streamer', 500000, 'Payer_Two')$$, 'R kündigt die Zahlung nachträglich an');
reset role;
select ok(public.has_active_premium('d4444444-4444-4444-4444-444444444444', 'streamer'), 'Der später gestellte Antrag wird durch den früheren Hinweis automatisch bestätigt');

-- 6) Schalter aus, und ein herabgestufter Admin verliert das Vertrauen
update public.app_settings set value = 'false'::jsonb where key = 'auto_approve_enabled';
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.payment_submissions (user_id, plan, claimed_amount_coins, payer_ingame_name)
  values ('b2222222-2222-2222-2222-222222222222', 'streamer', 500000, 'Payer_One')$$, 'P kündigt eine Verlängerung an');
reset role;
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, 'Payer_One', 'Empfaenger_Konto', 500000, 'Testzeile', 'k-disabled'
  from public.mod_ingest_tokens t where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222' and status = 'pending'), 1, 'Bei ausgeschalteter Auto-Freigabe bleibt alles offen (Admin entscheidet)');
update public.app_settings set value = 'true'::jsonb where key = 'auto_approve_enabled';
update public.profiles set role = 'user' where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.minecraft_payment_events (reported_by, token_id, sender_name, recipient_name, amount_coins, raw_message, dedupe_key)
select 'a1111111-1111-1111-1111-111111111111', t.id, 'Payer_One', 'Empfaenger_Konto', 500000, 'Testzeile', 'k-demoted'
  from public.mod_ingest_tokens t where t.user_id = 'a1111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.payment_submissions where user_id = 'b2222222-2222-2222-2222-222222222222' and status = 'pending'), 1, 'Ein Token, dessen Besitzer kein Admin mehr ist, verliert das Vertrauen');
update public.profiles set role = 'admin' where id = 'a1111111-1111-1111-1111-111111111111';

-- ===================== Punkte für Rezensionen =====================
insert into public.point_ledger (user_id, delta, reason, note) values ('b2222222-2222-2222-2222-222222222222', 7, 'adjustment', 'Testbonus');  -- fremdes Ledger, muss für B unsichtbar sein
select set_config('request.jwt.claims', '{"sub":"f6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('e5555555-5555-5555-5555-555555555555', 'f6666666-6666-6666-6666-666666666666', 5, 'Kurz und gut')$$, 'Kurze Rezension');
select lives_ok($$delete from public.reviews where reviewer_id = 'f6666666-6666-6666-6666-666666666666'$$, 'Kurze Rezension löschen');
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('e5555555-5555-5555-5555-555555555555', 'f6666666-6666-6666-6666-666666666666', 5, 'Eine ausführliche und ehrliche Rezension')$$, 'Lange Rezension');
select lives_ok($$delete from public.reviews where reviewer_id = 'f6666666-6666-6666-6666-666666666666'$$, 'Lange Rezension löschen');
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('e5555555-5555-5555-5555-555555555555', 'f6666666-6666-6666-6666-666666666666', 5, 'Eine ausführliche und ehrliche Rezension')$$, 'Lange Rezension neu schreiben');
reset role;
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'f6666666-6666-6666-6666-666666666666'), 10, 'Zu kurz: keine Punkte. Lang: 10 Punkte. Löschen und neu schreiben: nicht erneut (einmal je Streamer)');
select set_config('request.jwt.claims', '{"sub":"f6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('b2222222-2222-2222-2222-222222222222', 'f6666666-6666-6666-6666-666666666666', 4, 'Eine ausführliche und ehrliche Rezension')$$, 'Rezension 2');
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('c3333333-3333-3333-3333-333333333333', 'f6666666-6666-6666-6666-666666666666', 4, 'Eine ausführliche und ehrliche Rezension')$$, 'Rezension 3');
select lives_ok($$insert into public.reviews (streamer_id, reviewer_id, rating, body) values ('d4444444-4444-4444-4444-444444444444', 'f6666666-6666-6666-6666-666666666666', 4, 'Eine ausführliche und ehrliche Rezension')$$, 'Rezension 4 (über dem Tageslimit)');
select is_empty($$select 1 from public.point_ledger where user_id <> 'f6666666-6666-6666-6666-666666666666'$$, 'Das Ledger anderer Nutzer ist unsichtbar');
select throws_ok($$insert into public.point_ledger (user_id, delta, reason) values ('f6666666-6666-6666-6666-666666666666', 1000, 'adjustment')$$, '42501', null, 'Punkte lassen sich nicht selbst gutschreiben');
reset role;
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'f6666666-6666-6666-6666-666666666666'), 30, 'Tageslimit: höchstens 3 belohnte Rezensionen in 24 Stunden');

-- Moderation: entfernte Rezension, entfernte Punkte
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.moderate_review((select id from public.reviews where reviewer_id = 'f6666666-6666-6666-6666-666666666666' and streamer_id = 'e5555555-5555-5555-5555-555555555555'), true, 'Test: Regelverstoß')$$, 'Moderator entfernt eine Rezension');
reset role;
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'f6666666-6666-6666-6666-666666666666'), 20, 'Die Punkte der entfernten Rezension verfallen');

-- ===================== Creator-Codes =====================
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_creator_code('QCODE')$$, '42501', 'not_verified', 'Ohne blauen Haken gibt es keinen Creator-Code');
reset role;
select set_config('request.jwt.claims', '{"sub":"e5555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_creator_code('ab')$$, 'P0001', 'invalid_code', 'Ungültiges Code-Format wird abgelehnt');
select lives_ok($$select public.create_creator_code('vcode')$$, 'Verifizierte Streamer erstellen einen Code');
select throws_ok($$select public.create_creator_code('ZWEITER')$$, '23505', null, 'Pro Streamer nur ein Code');
select throws_ok($$select public.support_creator('VCODE')$$, 'P0001', 'own_code', 'Den eigenen Code kann man nicht nutzen');
reset role;
select is((select code from public.creator_codes where streamer_id = 'e5555555-5555-5555-5555-555555555555'), 'VCODE', 'Codes werden großgeschrieben gespeichert');

-- ===================== Shop =====================
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.admin_save_shop_item(null, 'Diamanten', 'Test-Artikel', 15, 5, 2, true, 0)$$, 'Admin legt einen Artikel an');
reset role;

select set_config('request.jwt.claims', '{"sub":"f6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.purchase_item((select id from public.shop_items where name = 'Diamanten'))$$, 'P0001', 'minecraft_not_linked', 'Ohne verknüpftes Minecraft-Konto kein Kauf');
select lives_ok($$select public.support_creator('vcode')$$, 'B unterstützt den Creator V');
select lives_ok($$select public.create_minecraft_link_code()$$, 'B erzeugt einen Code');
reset role;
select lives_ok($$select public.link_minecraft_name((select code from public.minecraft_link_codes where user_id = 'f6666666-6666-6666-6666-666666666666' and used_at is null), 'Buyer_One')$$, 'B ist mit Buyer_One verknüpft');

select set_config('request.jwt.claims', '{"sub":"f6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.purchase_item((select id from public.shop_items where name = 'Diamanten'))$$, 'B kauft den Artikel (15 von 20 Punkten)');
select throws_ok($$select public.purchase_item((select id from public.shop_items where name = 'Diamanten'))$$, 'P0001', 'not_enough_points', 'Mit zu wenigen Punkten (5 von 15) geht kein Kauf');
reset role;
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'f6666666-6666-6666-6666-666666666666'), 5, 'Der Kaufpreis wurde abgezogen');
select is((select stock from public.shop_items where name = 'Diamanten'), 4, 'Der Bestand sinkt');
select is((select minecraft_name from public.shop_orders where user_id = 'f6666666-6666-6666-6666-666666666666'), 'Buyer_One', 'Die Bestellung geht an den verifizierten Minecraft-Namen');
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'e5555555-5555-5555-5555-555555555555'), 1, 'Der Creator bekommt 10 % des Kaufpreises als Bonus (abgerundet: 1 von 15)');

-- Storno: Rückerstattung, Bestand zurück, Creator-Bonus wird entzogen
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.admin_set_order_status((select id from public.shop_orders limit 1), 'cancelled', 'Test')$$, 'Admin storniert die Bestellung');
reset role;
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'f6666666-6666-6666-6666-666666666666'), 20, 'Storno erstattet die Punkte');
select is((select stock from public.shop_items where name = 'Diamanten'), 5, 'Storno stellt den Bestand wieder her');
select is((select coalesce(sum(delta), 0)::int from public.point_ledger where user_id = 'e5555555-5555-5555-5555-555555555555'), 0, 'Storno nimmt dem Creator den Bonus wieder weg');

select * from finish();
rollback;
