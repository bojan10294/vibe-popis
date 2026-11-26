// Sends "popis završen" as a push notification to every admin phone that
// turned notifications on. The app calls it right after a count is finished.
//
// Deploy:  supabase functions deploy notify-count-finished --no-verify-jwt
// Secrets: supabase secrets set --env-file supabase/.env.push.local
//          (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY; optional VAPID_SUBJECT)
//
// Security: the caller must send a valid app session token (x-session-token),
// and a count is announced at most once (counts.notified_at), so the endpoint
// can't be used to spam the phones.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = req.headers.get('x-session-token') ?? ''
  const body = await req.json().catch(() => ({}))
  const countId = body?.count_id
  if (!token || typeof countId !== 'string') return json({ error: 'bad request' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: session } = await db
    .from('app_sessions')
    .select('user_id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!session) return json({ error: 'not allowed' }, 401)

  // Claim the count: only the first call for a finished count sends anything.
  const { data: count, error: claimError } = await db
    .from('counts')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', countId)
    .eq('status', 'finished')
    .is('notified_at', null)
    .select('id, user_name')
    .maybeSingle()
  if (claimError) return json({ error: claimError.message }, 500)
  if (!count) return json({ sent: 0, reason: 'already sent or not finished' })

  const { count: pending } = await db
    .from('order_lines')
    .select('id', { count: 'exact', head: true })
    .eq('count_id', countId)
    .eq('order_status', 'pending')

  const { data: admins } = await db.from('app_users').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((a) => a.id)
  if (!adminIds.length) return json({ sent: 0 })
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminIds)
  if (!subs?.length) return json({ sent: 0 })

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? req.headers.get('origin') ?? 'mailto:popis@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const n = pending ?? 0
  const payload = JSON.stringify({
    title: '✅ Popis završen',
    body: `${count.user_name} · ${n === 0 ? 'nema šta da se poruči' : `${n} ${n === 1 ? 'artikal' : 'artikala'} za poručiti`}`,
    url: `/admin/orders/${countId}`,
    tag: `count-${countId}`,
  })

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: 60 * 60 * 12,
        urgency: 'high',
      }),
    ),
  )

  // Phones that uninstalled the app or revoked permission: forget them.
  const gone = subs.filter((_, i) => {
    const r = results[i]
    const code = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined
    return code === 404 || code === 410
  })
  if (gone.length) await db.from('push_subscriptions').delete().in('endpoint', gone.map((s) => s.endpoint))

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results
    .map((r) => (r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : null))
    .filter(Boolean)
  return json({ sent, removed: gone.length, failed })
})
