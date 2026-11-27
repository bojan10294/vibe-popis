// Sends push notifications to every admin phone that turned notifications on:
//   { count_id }     "popis završen"   — right after a count is finished
//   { delivery_id }  "faktura unesena" — right after a worker confirms a delivery
//
// Deploy:  supabase functions deploy notify-count-finished --no-verify-jwt
// Secrets: supabase secrets set --env-file supabase/.env.push.local
//          (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY; optional VAPID_SUBJECT)
//
// Security: the caller must send a valid app session token (x-session-token),
// and each count / delivery is announced at most once (notified_at), so the
// endpoint can't be used to spam the phones.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Payload {
  title: string
  body: string
  url: string
  tag: string
}

const plural = (n: number) => (n === 1 ? 'artikal' : 'artikala')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = req.headers.get('x-session-token') ?? ''
  const body = await req.json().catch(() => ({}))
  const countId = typeof body?.count_id === 'string' ? body.count_id : null
  const deliveryId = typeof body?.delivery_id === 'string' ? body.delivery_id : null
  if (!token || (!countId && !deliveryId)) return json({ error: 'bad request' }, 400)

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

  const built = countId ? await countPayload(db, countId) : await deliveryPayload(db, deliveryId!)
  if ('error' in built) return json({ error: built.error }, 500)
  if (!built.payload) return json({ sent: 0, reason: 'already sent or not finished' })

  return json(await sendToAdmins(db, req, built.payload))
})

type Built = { payload: Payload | null } | { error: string }

async function countPayload(db: SupabaseClient, countId: string): Promise<Built> {
  // Claim the count: only the first call for a finished count sends anything.
  const { data: count, error } = await db
    .from('counts')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', countId)
    .eq('status', 'finished')
    .is('notified_at', null)
    .select('id, user_name')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!count) return { payload: null }

  const { count: pending } = await db
    .from('order_lines')
    .select('id', { count: 'exact', head: true })
    .eq('count_id', countId)

  const n = pending ?? 0
  return {
    payload: {
      title: '✅ Popis završen',
      body: `${count.user_name} · ${n === 0 ? 'nema šta da se poruči' : `${n} ${plural(n)} za poručiti`}`,
      url: `/admin/orders/${countId}`,
      tag: `count-${countId}`,
    },
  }
}

async function deliveryPayload(db: SupabaseClient, deliveryId: string): Promise<Built> {
  // Claim the delivery: only the first call for a confirmed one sends anything.
  const { data: delivery, error } = await db
    .from('deliveries')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('status', 'confirmed')
    .is('notified_at', null)
    .select('id, user_name, supplier_name')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!delivery) return { payload: null }

  const { data: lines } = await db.from('delivery_lines').select('direction').eq('delivery_id', deliveryId)
  const returned = (lines ?? []).filter((l) => l.direction === 'return').length
  const arrived = (lines ?? []).length - returned

  const parts = [
    delivery.user_name,
    delivery.supplier_name,
    arrived ? `${arrived} ${plural(arrived)}` : null,
    returned ? `↩ ${returned} vraćeno` : null,
  ].filter(Boolean)
  return {
    payload: {
      title: '📦 Faktura unesena',
      body: parts.join(' · '),
      url: `/admin/deliveries/${deliveryId}`,
      tag: `delivery-${deliveryId}`,
    },
  }
}

async function sendToAdmins(db: SupabaseClient, req: Request, payload: Payload) {
  const { data: admins } = await db.from('app_users').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((a) => a.id)
  if (!adminIds.length) return { sent: 0 }
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminIds)
  if (!subs?.length) return { sent: 0 }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? req.headers.get('origin') ?? 'mailto:popis@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const text = JSON.stringify(payload)
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, text, {
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
  return { sent, removed: gone.length, failed }
}
