// Thin fetch wrapper for the Pila More More backend. Enabled when VITE_API_URL is set
// (e.g. http://localhost:8080/api); otherwise the app runs as an offline demo.

import { BRAND } from '../config/brand'
import { homePath } from '../lib/roles'
import { STORAGE_KEYS, writeJSON } from '../store/storage'
import type { DemoSession } from '../types'

export const API_URL: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || undefined

// Visitors to a backend-connected site can still try the app: "local demo" switches this browser to
// the offline demo (mock data kept in localStorage) without touching the server. A full page load is
// needed to switch, because the data store picks its mode once at startup.
const LOCAL_DEMO_KEY = `${BRAND.storagePrefix}:local-demo`
// A real sign-in set aside while its owner shows the demo to someone, put back on leaving it.
const PARKED_SESSION_KEY = `${BRAND.storagePrefix}:parked-session`

function readLocalDemoFlag() {
  try {
    return localStorage.getItem(LOCAL_DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export const isLocalDemo = Boolean(API_URL) && readLocalDemoFlag()
export const isApiMode = Boolean(API_URL) && !isLocalDemo

/**
 * Starts (or switches to) a demo identity with a full page load, so the data store opens that
 * identity's demo workspace. On a backend-connected site it also turns on the browser-only demo.
 * `keepAccount`: the current sign-in waits aside, and leaving the demo returns to it.
 */
export function enterLocalDemo(session: DemoSession, path: string, { keepAccount = false } = {}) {
  try {
    if (keepAccount) {
      const current = localStorage.getItem(STORAGE_KEYS.session)
      if (current) localStorage.setItem(PARKED_SESSION_KEY, current)
    }
    if (API_URL) localStorage.setItem(LOCAL_DEMO_KEY, '1')
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session))
  } catch {
    return false
  }
  window.location.assign(path)
  return true
}

/** Whether leaving the demo goes back to an account set aside by enterLocalDemo's `keepAccount`. */
export function hasParkedAccount() {
  try {
    return !!localStorage.getItem(PARKED_SESSION_KEY)
  } catch {
    return false
  }
}

/**
 * Back to the real (backend) site: into the account set aside on the way in, else signed out.
 * Demo data stays in this browser for next time.
 */
export function exitLocalDemo() {
  let parked: DemoSession | null = null
  try {
    localStorage.removeItem(LOCAL_DEMO_KEY)
    parked = JSON.parse(localStorage.getItem(PARKED_SESSION_KEY) ?? 'null') as DemoSession | null
    localStorage.removeItem(PARKED_SESSION_KEY)
  } catch {
    // Storage unavailable: the flag could not have been set either.
  }
  writeJSON(STORAGE_KEYS.session, parked?.token ? parked : null)
  window.location.assign(parked?.token ? homePath(parked.role) : '/login')
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', '無法連線到伺服器，請確認網路或稍後再試')
  }
  const text = await res.text()
  const json = text ? safeParse(text) : null
  if (!res.ok) {
    const err = (json ?? {}) as { code?: string; message?: string }
    throw new ApiError(res.status, err.code ?? 'http_' + res.status, err.message ?? `伺服器錯誤（${res.status}）`)
  }
  return json as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export interface AuthResponse {
  token: string
  expiresAt: string
  user: {
    userId: string
    role: 'coach' | 'owner' | 'student'
    name: string
    email: string
    coachId: string
    studentId?: string
    /** false: a new account that must open the mailed link before anything else works. */
    emailVerified?: boolean
  }
}
