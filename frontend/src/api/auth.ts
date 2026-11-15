import type { DemoSession } from '../types'
import { api, type AuthResponse } from './client'

export const toSession = (r: AuthResponse): DemoSession => ({
  role: r.user.role,
  studentId: r.user.studentId ?? '',
  token: r.token,
  name: r.user.name,
  unverifiedEmail: r.user.emailVerified === false ? r.user.email : undefined,
})

export async function login(email: string, password: string) {
  return toSession(await api<AuthResponse>('POST', '/auth/login', { email, password }))
}

export async function registerStudio(input: { name: string; email: string; password: string; studio: string }) {
  return toSession(await api<AuthResponse>('POST', '/auth/register-studio', input))
}

export async function activateInvite(inviteCode: string, password: string) {
  return toSession(await api<AuthResponse>('POST', '/auth/activate', { inviteCode, password }))
}

export async function createInvite(studentId: string, token: string) {
  return api<{ inviteCode: string; expiresAt: string }>('POST', `/students/${studentId}/invite`, undefined, token)
}

/** Signs in with a Google ID token. A new user gets ApiError 'signup_required' until they send an account type. */
export async function googleSignIn(credential: string, signup?: { accountType: 'studio'; studio: string }) {
  return toSession(await api<AuthResponse>('POST', '/auth/google', { credential, ...signup }))
}

/** Mails a reset link if the email is registered; the answer is the same either way. */
export async function forgotPassword(email: string) {
  await api('POST', '/auth/forgot-password', { email })
}

/** Sets a new password with the token from the mailed link, and signs in. */
export async function resetPassword(token: string, password: string) {
  return toSession(await api<AuthResponse>('POST', '/auth/reset-password', { token, password }))
}

/** Opens the link mailed after signing up: proves the email and signs in. */
export async function verifyEmail(token: string) {
  return toSession(await api<AuthResponse>('POST', '/auth/verify-email', { token }))
}

/** Mails another verification link (the server sends at most one a minute). */
export async function resendVerification(token: string) {
  await api('POST', '/auth/verify-email/resend', undefined, token)
}

/** A new token for the current role (after a paid upgrade turned a coach into a studio owner). */
export async function refreshSession(token: string) {
  return toSession(await api<AuthResponse>('POST', '/auth/refresh', undefined, token))
}
