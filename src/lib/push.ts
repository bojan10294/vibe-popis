import { deletePushSubscription, savePushSubscription } from '../data/repository'

// Public half of the VAPID key pair (safe to ship). The private half is a
// Supabase secret used by the notify-count-finished Edge Function.
const VAPID_PUBLIC_KEY =
  'BAz94mCs7fsv9siQJL_zgVVysS_XjglU6ynl4YhFLJLRaM-HyvcbfXiUCXP2G4pAyqlzAR0PO8ons0HQeyFPzhI'

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** The service worker is only registered in the built app (see main.tsx). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function getPushState(): Promise<PushState> {
  // iPhone only allows web push for apps added to the home screen.
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  const reg = await registration()
  if (!reg) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Must be called from a tap (browsers only ask for permission on a user gesture). */
export async function enablePush(): Promise<PushState> {
  const reg = await registration()
  if (!reg) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    }))
  const json = sub.toJSON()
  await savePushSubscription(sub.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '')
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
