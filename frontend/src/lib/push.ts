// Class reminders on this device (Web Push). The backend sends them the day before a class (1 p.m.) and
// when a coming class is cancelled or moved; public/sw.js shows them. On iPhone this only works in
// the app added to the home screen (iOS 16.4+), not in a Safari tab.
import { api, API_URL, isApiMode } from '../api/client'

/** on/off: subscribed or not; install: iPhone in a Safari tab; denied: blocked in the phone's settings. */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Where to turn notifications back on once they were blocked: it depends on the device. */
export function deniedHelp() {
  if (isIos()) return '通知已被封鎖。請到 iPhone 的「設定」→「通知」找到 Pila More More 並允許通知，再回來這裡。'
  if (/Android/.test(navigator.userAgent))
    return standalone()
      ? '通知已被封鎖。請到手機的「設定」→「應用程式」找到 Pila More More，開啟通知後再回來這裡。'
      : '通知已被封鎖。請點網址列左邊的圖示 →「權限」或「網站設定」，把「通知」改成允許，再回來這裡。'
  return '通知已被這個瀏覽器封鎖。請點網址列左邊的圖示（鎖頭或設定），把「通知」改成允許，重新整理頁面後再回來這裡。無痕視窗無法開啟通知。'
}

/** Push needs the backend and a service worker (registered in production builds only). */
export const pushAvailable = () => isApiMode && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return isApiMode && isIos() && !standalone() ? 'install' : 'unsupported'
  if (!(await navigator.serviceWorker.getRegistration())) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && (await subscription()) ? 'on' : 'off'
}

function keyBytes(base64url: string) {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Asks for permission (call straight from a tap: iPhone only asks then) and registers this device. */
export async function enablePush(token: string): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const { enabled, publicKey } = await api<{ enabled: boolean; publicKey: string }>('GET', '/push/key', undefined, token)
  if (!enabled) throw new Error('通知功能尚未開放')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api('PUT', '/push/subscription', sub.toJSON(), token)
  return 'on'
}

export async function disablePush(token: string) {
  const sub = await subscription()
  if (!sub) return
  await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }, token).catch(() => undefined)
  await sub.unsubscribe()
}

/** On each sign-in: a device that allowed notifications reports to whoever is signed in now. */
export async function syncPushDevice(token: string) {
  if (!pushAvailable() || Notification.permission !== 'granted') return
  const sub = await subscription()
  if (sub) await api('PUT', '/push/subscription', sub.toJSON(), token).catch(() => undefined)
}

/** Signing out: this device stops notifying the account. Best effort, sent as the page changes. */
export function forgetPushDevice(token: string) {
  if (!pushAvailable()) return
  void subscription().then((sub) => {
    if (!sub) return
    void fetch(`${API_URL}/push/unsubscribe`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined)
    void sub.unsubscribe()
  })
}

export async function loadEmailReminders(token: string) {
  return (await api<{ emailReminders: boolean }>('GET', '/push/settings', undefined, token)).emailReminders
}

export async function saveEmailReminders(token: string, on: boolean) {
  await api('PUT', '/push/settings', { emailReminders: on }, token)
}
