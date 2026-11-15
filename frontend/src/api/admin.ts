// The service owner's page (see the backend's AdminService). Not there for anyone else.
import type { BillingStatus, PlanId } from '../types'
import { api } from './client'

export interface AdminWorkspace {
  id: string
  kind: 'studio'
  name: string
  ownerName?: string
  ownerEmail?: string
  /** False when its owner moved into someone else's workspace (kept in case they come back; not counted). */
  inUse: boolean
  plan: PlanId
  status: BillingStatus
  trialEndsAt?: string
  currentPeriodEnd?: string
  /** What its card is charged each month (0 unless paying). */
  monthlyAmount: number
  activeStudents: number
  coaches: number
  extraStudentPacks: number
  extraCoachSeats: number
  createdAt?: string
}

export interface AdminOverview {
  users: number
  /** Accounts with a workspace of their own, which they pay for, by kind (studio, solo, self). */
  owners: Record<string, number>
  /** Accounts invited into someone else's workspace, who pays: studioCoach, student. */
  members: Record<string, number>
  signups7d: number
  signups30d: number
  workspacesByStatus: Record<string, number>
  paying: number
  mrr: number
  workspaces: AdminWorkspace[]
}

/**
 * One account, with how much it uses the app (counts only, no training content). Coaches: students
 * they're responsible for and classes they led; students and self-trackers: their own workouts.
 */
export interface AdminUser {
  id: string
  kind: 'owner' | 'studioCoach' | 'student'
  name: string
  email?: string
  workspaceId?: string
  workspaceName?: string
  /** How they sign in; none: invited, not activated yet. */
  login: 'google' | 'apple' | 'password' | 'none'
  /** False: a studio coach the owner turned off. */
  active: boolean
  createdAt?: string
  /** When the app last loaded their data (unset until they open it after this was added). */
  lastSeenAt?: string
  students: number
  workouts: number
  workouts30d: number
  lastWorkoutAt?: string
}

export const adminStatus = (token: string) => api<{ admin: boolean }>('GET', '/admin/status', undefined, token)
export const adminOverview = (token: string) => api<AdminOverview>('GET', '/admin/overview', undefined, token)
export const adminUsers = (token: string) => api<AdminUser[]>('GET', '/admin/users', undefined, token)
export const grantComplimentary = (id: string, extras: { extraStudentPacks: number; extraCoachSeats: number }, token: string) =>
  api('PUT', `/admin/workspaces/${id}/complimentary`, extras, token)
export const revokeComplimentary = (id: string, token: string) => api('DELETE', `/admin/workspaces/${id}/complimentary`, undefined, token)
