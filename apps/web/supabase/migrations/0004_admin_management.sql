-- SMPEvents · Migration 0004 · Verwaltung für das Admin-Dashboard (Rollen, Premium entziehen)

-- Rollen ändert ausschließlich ein Admin, nie für das eigene Konto, immer mit Begründung und Audit-Eintrag.
create or replace function public.set_user_role(p_user uuid, p_role public.app_role, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.app_role;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select p.role into v_old from public.profiles p where p.id = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_old = p_role then return; end if;
  update public.profiles set role = p_role where id = p_user;
  perform public.log_admin_action('user.role', 'profile', p_user::text,
    jsonb_build_object('from', v_old, 'to', p_role, 'reason', left(p_reason, 500)));
end $$;

-- Beendet laufende Laufzeiten sofort und entfernt noch nicht begonnene (z. B. nach einer Rückbuchung).
create or replace function public.revoke_premium(p_user uuid, p_plan public.premium_plan, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ended integer;
  v_removed integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.subscriptions set expires_at = now()
   where user_id = p_user and plan = p_plan and starts_at < now() and expires_at > now();
  get diagnostics v_ended = row_count;
  delete from public.subscriptions where user_id = p_user and plan = p_plan and starts_at >= now();
  get diagnostics v_removed = row_count;
  if v_ended = 0 and v_removed = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.log_admin_action('premium.revoke', 'profile', p_user::text,
    jsonb_build_object('plan', p_plan, 'ended', v_ended, 'removed_queued', v_removed, 'reason', left(p_reason, 500)));
end $$;

-- Neue Funktionen bekommen von Supabase standardmäßig EXECUTE für anon/authenticated: erst entziehen, dann gezielt freigeben.
revoke execute on function public.set_user_role(uuid, public.app_role, text),
                           public.revoke_premium(uuid, public.premium_plan, text)
  from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, public.app_role, text),
                          public.revoke_premium(uuid, public.premium_plan, text)
  to authenticated;
