-- 012: push notifications ("popis završen" on the admin's phone).
--   push_subscriptions  one row per phone/browser that turned notifications on.
--                       Not readable from the app; written through the RPCs
--                       below and read by the notify-count-finished function.
--   counts.notified_at  set when the notification went out, so it goes once.
-- Safe to re-run.

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id text not null references app_users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;  -- no policies: only via RPC
revoke all on push_subscriptions from anon, authenticated;

alter table counts add column if not exists notified_at timestamptz;

create or replace function app_session_user_id() returns text
language sql stable security definer set search_path = public as $$
  select s.user_id from app_sessions s
  where s.token = coalesce(current_setting('request.headers', true)::json ->> 'x-session-token', '')
    and s.expires_at > now()
$$;

create or replace function app_save_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app_is_admin() then raise exception 'not allowed'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, app_session_user_id(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function app_delete_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = app_session_user_id()
$$;

grant execute on function app_save_push(text, text, text), app_delete_push(text) to anon, authenticated;

notify pgrst, 'reload schema';
