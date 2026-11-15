// "Sign in with Google" (Google Identity Services). Google renders the button and hands back an ID
// token (`credential`) that the backend verifies. Hidden when VITE_GOOGLE_CLIENT_ID is not set.
import { API_URL } from '../api/client'

export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback?: (r: { credential: string }) => void; ux_mode?: 'popup' | 'redirect'; login_uri?: string }) => void
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

let loading: Promise<GoogleIdentity> | null = null

export function loadGoogle() {
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google 登入載入失敗')))
    script.onerror = () => {
      loading = null
      reject(new Error('Google 登入載入失敗，請檢查網路'))
    }
    document.head.append(script)
  })
  return loading
}

/** Name and email from a Google ID token, for display only (the server verifies it). */
export function googleProfile(credential: string): { name?: string; email?: string } {
  try {
    const payload = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
}

/**
 * Where Google's full-page sign-in posts the token: the API on this same site (so the backend can
 * send the browser back here). Only when the API shares the site's origin, i.e. not in local development.
 */
export function googleRedirectUri(): string | undefined {
  return API_URL?.startsWith('/') ? `${location.origin}${API_URL}/auth/google/redirect` : undefined
}

/**
 * Phones get the full-page sign-in: Google's popup opens in a separate sheet there (in-app browsers,
 * home-screen apps) and can't hand the token back, leaving a blank page.
 */
export const prefersGoogleRedirect = () => !!googleRedirectUri() && window.matchMedia('(pointer: coarse)').matches

/**
 * Back from Google's full-page sign-in (see the backend's /auth/google/redirect): the token, 'error',
 * or null when this isn't such a return. Clears it from the address bar either way.
 */
export function takeGoogleRedirect(): string | 'error' | null {
  const hash = new URLSearchParams(location.hash.slice(1))
  if (!hash.has('google') && !hash.has('google_error')) return null
  history.replaceState(history.state, '', location.pathname + location.search)
  const credential = hash.get('google')
  const csrf = hash.get('csrf')
  // Google's double-submit check: what it posted back must match the cookie it set on this page,
  // so another site can't sign you in to an account of its choosing.
  const cookie = document.cookie
    .split('; ')
    .find((c) => c.startsWith('g_csrf_token='))
    ?.slice('g_csrf_token='.length)
  return credential && csrf && csrf === cookie ? credential : 'error'
}

/**
 * In-app browsers (LINE, Facebook, Instagram…) where Google refuses to sign in. LINE can be asked to
 * open the page in the phone's browser instead.
 */
export function inAppBrowser(): 'line' | 'other' | null {
  const ua = navigator.userAgent
  if (/\bLine\//i.test(ua)) return 'line'
  if (/FBAN|FBAV|FB_IAB|Instagram|Threads|MicroMessenger|KAKAOTALK|Twitter/i.test(ua)) return 'other'
  return null
}
