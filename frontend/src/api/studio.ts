// Studio management calls that need the server's answer (invite codes, a new token), so they are
// made directly instead of through the local action + sync queue.
import type { CoachMember } from '../types'
import { api } from './client'

export interface CoachInvite {
  coach: CoachMember
  inviteCode: string | null
  expiresAt: string
}

export function inviteCoach(input: { name: string; email: string; title?: string }, token: string) {
  return api<CoachInvite>('POST', '/studio/coaches', input, token)
}

export function reinviteCoach(coachId: string, token: string) {
  return api<CoachInvite>('POST', `/studio/coaches/${coachId}/invite`, undefined, token)
}
