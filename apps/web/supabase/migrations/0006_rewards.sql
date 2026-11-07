-- SMPEvents · Migration 0006 · Punkte, Creator-Codes und Shop
--
-- Alle Beträge und Prozentwerte stehen in app_settings und sind jederzeit änderbar.
-- Punkte entstehen nur serverseitig (Ledger, nur anfügen); Clients können nichts schreiben.

insert into public.app_settings (key, value, description) values
  ('points_per_review',          '10', 'Punkte für die erste Rezension je Streamer'),
  ('points_review_min_length',   '20', 'Mindestlänge des Rezensionstextes für Punkte (Zeichen)'),
  ('points_review_daily_cap',    '3',  'Höchstens so viele belohnte Rezensionen pro Nutzer und 24 Stunden'),
  ('creator_commission_percent', '10', 'Prozent des Kaufpreises (in Punkten), die der Creator bei Käufen seiner Unterstützer bekommt')
on conflict (key) do nothing;

-- ===== Punkte-Ledger =====
create table public.point_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     text not null check (reason in ('review', 'review_revoked', 'creator_commission', 'commission_revoked', 'purchase', 'purchase_refund', 'adjustment')),
  ref_type   text,
  ref_id     uuid,
  note       text,
  created_at timestamptz not null default now()
);
create index point_ledger_user_idx on public.point_ledger (user_id, created_at desc);
-- Rezensions-Punkte gibt es je (Nutzer, Streamer) nur einmal, auch wenn die Rezension gelöscht und neu geschrieben wird.
create unique index point_ledger_review_once        on public.point_ledger (user_id, ref_id) where reason = 'review';
create unique index point_ledger_review_revoke_once on public.point_ledger (user_id, ref_id) where reason = 'review_revoked';

create view public.point_balances with (security_invoker = true) as
  select l.user_id, sum(l.delta)::bigint as balance from public.point_ledger l group by l.user_id;

-- ===== Creator-Codes =====
create table public.creator_codes (
  id          uuid primary key default gen_random_uuid(),
  streamer_id uuid not null unique references public.streamer_profiles (id) on delete cascade,
  code        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint creator_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,19}$')
);

create table public.creator_supporters (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  creator_code_id uuid not null references public.creator_codes (id) on delete cascade,
  since           timestamptz not null default now()
);
create index creator_supporters_code_idx on public.creator_supporters (creator_code_id);

-- ===== Shop =====
create table public.shop_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price_points  integer not null check (price_points > 0),
  stock         integer check (stock is null or stock >= 0),          -- NULL = unbegrenzt
  max_per_user  integer check (max_per_user is null or max_per_user > 0),
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint shop_items_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint shop_items_desc_len check (description is null or char_length(description) <= 500)
);
create trigger shop_items_touch before update on public.shop_items for each row execute function public.touch_updated_at();

create table public.shop_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  item_id         uuid not null references public.shop_items (id) on delete restrict,
  item_name       text not null,
  price_points    integer not null,
  minecraft_name  text not null,
  creator_code_id uuid references public.creator_codes (id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'delivered', 'cancelled')),
  note            text,
  handled_by      uuid references public.profiles (id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index shop_orders_user_idx   on public.shop_orders (user_id, created_at desc);
create index shop_orders_status_idx on public.shop_orders (status, created_at);

-- ===== Rezensions-Punkte (serverseitig, mit Schutz vor Farmen) =====
create or replace function public.grant_review_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pts integer := public.setting_int('points_per_review', 10);
  v_min integer := public.setting_int('points_review_min_length', 20);
  v_cap integer := public.setting_int('points_review_daily_cap', 3);
begin
  if v_pts <= 0 or char_length(btrim(new.body)) < v_min then return null; end if;
  if (select count(*) from public.point_ledger l
       where l.user_id = new.reviewer_id and l.reason = 'review' and l.created_at > now() - interval '24 hours') >= v_cap then
    return null;
  end if;
  insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
  values (new.reviewer_id, v_pts, 'review', 'streamer', new.streamer_id, 'Rezension geschrieben')
  on conflict do nothing;
  return null;
end $$;
create trigger reviews_grant_points after insert on public.reviews
  for each row execute function public.grant_review_points();

-- Moderation: wird eine Rezension entfernt, verfallen ihre Punkte (die Funktion aus 0002, ergänzt)
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
  if p_remove then
    insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
    select l.user_id, -l.delta, 'review_revoked', 'streamer', l.ref_id, 'Rezension entfernt'
      from public.point_ledger l
     where l.user_id = v_row.reviewer_id and l.reason = 'review' and l.ref_id = v_row.streamer_id
    on conflict do nothing;
  end if;
  perform public.log_admin_action(case when p_remove then 'review.remove' else 'review.restore' end,
    'review', p_review_id::text,
    jsonb_build_object('streamer_id', v_row.streamer_id, 'reviewer_id', v_row.reviewer_id,
                       'rating', v_row.rating, 'reason', left(p_reason, 500)));
end $$;

-- ===== Creator-Codes =====
create or replace function public.create_creator_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.streamer_profiles s where s.id = v_uid and s.is_verified) then
    raise exception 'not_verified' using errcode = '42501';             -- nur Streamer mit blauem Haken
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,19}$' then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  insert into public.creator_codes (streamer_id, code) values (v_uid, v_code) returning id into v_id;   -- UNIQUE: ein Code je Streamer
  return v_id;
end $$;

create or replace function public.support_creator(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cc uuid;
  v_creator uuid;
  v_cur public.creator_supporters;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select cc.id, cc.streamer_id into v_cc, v_creator
    from public.creator_codes cc join public.streamer_profiles s on s.id = cc.streamer_id
   where cc.code = upper(btrim(p_code)) and cc.active and s.is_verified;
  if v_cc is null then raise exception 'invalid_code' using errcode = 'P0001'; end if;
  if v_creator = v_uid then raise exception 'own_code' using errcode = 'P0001'; end if;
  select * into v_cur from public.creator_supporters where user_id = v_uid;
  if found and v_cur.creator_code_id <> v_cc and v_cur.since > now() - interval '30 days' then
    raise exception 'support_cooldown' using errcode = 'P0001';          -- höchstens alle 30 Tage wechseln
  end if;
  insert into public.creator_supporters as cs (user_id, creator_code_id) values (v_uid, v_cc)
  on conflict (user_id) do update
    set creator_code_id = excluded.creator_code_id,
        since = case when cs.creator_code_id = excluded.creator_code_id then cs.since else now() end;
end $$;

create or replace function public.stop_supporting() returns void
language sql security definer set search_path = '' as $$
  delete from public.creator_supporters where user_id = (select auth.uid());
$$;

create or replace function public.my_creator_stats() returns table (supporters bigint, points_earned bigint)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.creator_supporters cs join public.creator_codes cc on cc.id = cs.creator_code_id
      where cc.streamer_id = (select auth.uid())),
    coalesce((select sum(l.delta) from public.point_ledger l
               where l.user_id = (select auth.uid()) and l.reason in ('creator_commission', 'commission_revoked')), 0)::bigint;
$$;

-- ===== Kaufen =====
create or replace function public.purchase_item(p_item_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  it public.shop_items;
  v_balance bigint;
  v_cc uuid;
  v_creator uuid;
  v_order uuid;
  v_pct integer := public.setting_int('creator_commission_percent', 10);
  v_comm integer;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform 1 from public.profiles p where p.id = v_uid for update;          -- Käufe eines Nutzers laufen nacheinander
  select l.minecraft_name into v_name from public.minecraft_links l where l.user_id = v_uid;
  if v_name is null then raise exception 'minecraft_not_linked' using errcode = 'P0001'; end if;

  select * into it from public.shop_items where id = p_item_id for update;
  if not found or not it.active then raise exception 'not_found' using errcode = 'P0002'; end if;
  if it.stock is not null and it.stock <= 0 then raise exception 'sold_out' using errcode = 'P0001'; end if;
  if it.max_per_user is not null
     and (select count(*) from public.shop_orders o where o.user_id = v_uid and o.item_id = it.id and o.status <> 'cancelled') >= it.max_per_user then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;
  select coalesce(sum(l.delta), 0) into v_balance from public.point_ledger l where l.user_id = v_uid;
  if v_balance < it.price_points then raise exception 'not_enough_points' using errcode = 'P0001'; end if;

  select cc.id, cc.streamer_id into v_cc, v_creator
    from public.creator_supporters cs
    join public.creator_codes cc on cc.id = cs.creator_code_id
    join public.streamer_profiles sp on sp.id = cc.streamer_id
   where cs.user_id = v_uid and cc.active and sp.is_verified;

  insert into public.shop_orders (user_id, item_id, item_name, price_points, minecraft_name, creator_code_id)
  values (v_uid, it.id, it.name, it.price_points, v_name, v_cc) returning id into v_order;
  insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
  values (v_uid, -it.price_points, 'purchase', 'order', v_order, it.name);
  if it.stock is not null then update public.shop_items set stock = stock - 1 where id = it.id; end if;

  if v_creator is not null and v_pct > 0 then
    v_comm := floor(it.price_points * v_pct / 100.0)::integer;
    if v_comm > 0 then
      insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
      values (v_creator, v_comm, 'creator_commission', 'order', v_order, 'Kauf eines Unterstützers mit deinem Creator-Code');
    end if;
  end if;
  return v_order;
end $$;

-- ===== Admin: Shop, Bestellungen, Punkte =====
create or replace function public.admin_save_shop_item(
  p_id uuid, p_name text, p_description text, p_price integer, p_stock integer, p_max_per_user integer, p_active boolean, p_sort integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.shop_items (name, description, price_points, stock, max_per_user, active, sort_order)
    values (btrim(p_name), nullif(btrim(p_description), ''), p_price, p_stock, p_max_per_user, coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.shop_items
       set name = btrim(p_name), description = nullif(btrim(p_description), ''), price_points = p_price, stock = p_stock,
           max_per_user = p_max_per_user, active = coalesce(p_active, true), sort_order = coalesce(p_sort, 0)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform public.log_admin_action('shop.item.save', 'shop_item', v_id::text, jsonb_build_object('name', p_name, 'price', p_price, 'stock', p_stock));
  return v_id;
end $$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('delivered', 'cancelled') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if o.status <> 'open' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  if p_status = 'cancelled' then
    insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
    values (o.user_id, o.price_points, 'purchase_refund', 'order', o.id, 'Bestellung storniert');
    update public.shop_items set stock = stock + 1 where id = o.item_id and stock is not null;
    insert into public.point_ledger (user_id, delta, reason, ref_type, ref_id, note)
    select l.user_id, -l.delta, 'commission_revoked', 'order', o.id, 'Bestellung storniert'
      from public.point_ledger l where l.reason = 'creator_commission' and l.ref_id = o.id;
  end if;
  update public.shop_orders set status = p_status, handled_by = auth.uid(), handled_at = now(), note = left(p_note, 500) where id = p_order_id;
  perform public.log_admin_action('shop.order.' || p_status, 'shop_order', p_order_id::text, jsonb_build_object('note', left(p_note, 500)));
end $$;

create or replace function public.admin_adjust_points(p_user uuid, p_delta integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.point_ledger (user_id, delta, reason, note) values (p_user, p_delta, 'adjustment', left(p_reason, 500));
  perform public.log_admin_action('points.adjust', 'profile', p_user::text, jsonb_build_object('delta', p_delta, 'reason', left(p_reason, 500)));
end $$;

-- ===== Rechte =====
revoke all on public.point_ledger, public.point_balances, public.creator_codes, public.creator_supporters,
              public.shop_items, public.shop_orders from anon, authenticated;
grant select on public.point_ledger, public.point_balances, public.creator_supporters, public.shop_orders to authenticated;
grant select on public.creator_codes, public.shop_items to anon, authenticated;

alter table public.point_ledger       enable row level security;
alter table public.creator_codes      enable row level security;
alter table public.creator_supporters enable row level security;
alter table public.shop_items         enable row level security;
alter table public.shop_orders        enable row level security;

create policy ledger_read on public.point_ledger for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy creator_codes_read on public.creator_codes for select to anon, authenticated
  using (active or streamer_id = (select auth.uid()) or public.is_admin());
create policy supporters_read on public.creator_supporters for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy shop_items_read on public.shop_items for select to anon, authenticated
  using (active or public.is_admin());
create policy shop_orders_read on public.shop_orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke execute on function
  public.grant_review_points(), public.moderate_review(uuid, boolean, text),
  public.create_creator_code(text), public.support_creator(text), public.stop_supporting(), public.my_creator_stats(),
  public.purchase_item(uuid), public.admin_save_shop_item(uuid, text, text, integer, integer, integer, boolean, integer),
  public.admin_set_order_status(uuid, text, text), public.admin_adjust_points(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function
  public.moderate_review(uuid, boolean, text),
  public.create_creator_code(text), public.support_creator(text), public.stop_supporting(), public.my_creator_stats(),
  public.purchase_item(uuid), public.admin_save_shop_item(uuid, text, text, integer, integer, integer, boolean, integer),
  public.admin_set_order_status(uuid, text, text), public.admin_adjust_points(uuid, integer, text)
  to authenticated;
