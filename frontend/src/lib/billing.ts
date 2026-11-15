// Prices and limits. Mirrors backend billing/Plans.java (the server enforces them).
import type { AppData, Billing, BillingStatus, PlanId } from '../types'

export const TRIAL_DAYS = 30

/** The one plan every studio is on. */
export const PLANS: Record<PlanId, { name: string; price: number; students: number; coaches: number }> = {
  team: { name: '工作室 Team', price: 999, students: 100, coaches: 3 },
}

export const STUDENT_PACK = { size: 10, price: 99 }
export const COACH_SEAT_PRICE = 199
export const MAX_STUDENT_PACKS = 100
export const MAX_COACH_SEATS = 50

/** How billing works, shown on the pricing page, the billing page and in the terms. */
export const BILLING_RULES = [
  '活躍學員才佔名額：已結案、停用的學員不計費，歷史資料仍保留。',
  '老師名額按帳號計算：邀請一位老師就佔一個名額；停用或移除後釋出。',
  '超過名額不會刪除資料，只會暫停新增學員或老師。',
  '加購立即生效，本期按剩餘天數比例收費；減少名額於下個計費週期生效。',
  '同一位學員在同一工作室只算一次，不會因為兩位老師共同管理而重複計費。',
]

export const STATUS_LABEL: Record<BillingStatus, string> = {
  trialing: '免費試用中',
  active: '訂閱中',
  past_due: '扣款失敗',
  canceled: '已取消（本期仍可使用）',
  expired: '已到期・唯讀',
  complimentary: '永久版',
}

/** Team plus the add-ons: extra student packs and extra teacher seats. */
export const monthlyPrice = (packs: number, seats: number) => PLANS.team.price + packs * STUDENT_PACK.price + seats * COACH_SEAT_PRICE

export const studentLimit = (packs: number) => PLANS.team.students + packs * STUDENT_PACK.size

export const coachLimit = (seats: number) => PLANS.team.coaches + seats

/** Where billing lives (only the owner manages it; teachers see the status). */
export const BILLING_PATH = '/coach/billing'

/** Estimated prorated charge for an upgrade: the monthly difference times what is left of the period. */
export function prorate(monthlyDelta: number, periodEnd: string | undefined, now = new Date()) {
  if (monthlyDelta <= 0 || !periodEnd) return 0
  const end = new Date(periodEnd)
  const start = new Date(end)
  start.setMonth(start.getMonth() - 1)
  const left = (end.getTime() - now.getTime()) / (end.getTime() - start.getTime())
  return left <= 0 ? 0 : Math.ceil(monthlyDelta * Math.min(1, left))
}

/** Whole days left (rounded up), never negative. */
export const daysLeft = (iso: string, now = new Date()) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000))

/** Active students in the whole workspace, including ones the caller cannot see. */
export const activeStudentsOf = (d: AppData) => (d.billing?.hiddenActiveStudents ?? 0) + d.students.filter((s) => s.status === 'active').length

export const limitMessage = (b: Billing) =>
  `活躍學員已達方案上限（${b.studentLimit} 位）。` + (b.canManage ? '請至「方案與付款」加購名額，或將已結案的學員設為停用。' : '請聯絡工作室經營者加購名額。')

export const readOnlyMessage = (b: Billing) =>
  b.canManage ? '方案已到期，目前為唯讀。訂閱後即可繼續新增與編輯，資料都還在。' : '工作室的方案已到期，目前為唯讀。請聯絡工作室經營者。'
