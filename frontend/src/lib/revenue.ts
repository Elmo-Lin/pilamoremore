// Monthly sessions report: the coached sessions given in a month, each valued at the price per
// session of the package it was deducted from (package price ÷ package sessions). Gyms take payment
// for a block of sessions up front, so this is what a month's teaching earned.
import type { AppData, ID, SessionPackage, WorkoutSession } from '../types'
import { deductionFor } from './sessions'
import { workoutDate } from './stats'

export interface SessionLine {
  workout: WorkoutSession
  /** The package the session was deducted from; undefined while not deducted. */
  pkg?: SessionPackage
  /** null: not deducted yet, so not valued. */
  value: number | null
}

export interface Totals {
  sessions: number
  deducted: number
  value: number
}

export const pricePerSession = (p: SessionPackage) => (p.totalSessions > 0 ? p.priceTwd / p.totalSessions : 0)

/** Finished coached sessions in the given month (by the day they took place), oldest first. */
export function monthSessions(d: AppData, year: number, month: number): SessionLine[] {
  const from = new Date(year, month, 1).getTime()
  const to = new Date(year, month + 1, 1).getTime()
  return d.workouts
    .filter((w) => w.type === 'coached' && w.status === 'completed')
    .filter((w) => {
      const t = new Date(workoutDate(w)).getTime()
      return t >= from && t < to
    })
    .sort((a, b) => workoutDate(a).localeCompare(workoutDate(b)))
    .map((workout) => {
      const deduction = deductionFor(workout.id, d.transactions)
      const pkg = deduction ? d.packages.find((p) => p.id === deduction.packageId) : undefined
      return { workout, pkg, value: deduction ? (pkg ? pricePerSession(pkg) : 0) : null }
    })
}

export function totals(lines: SessionLine[]): Totals {
  return lines.reduce(
    (t, l) => ({ sessions: t.sessions + 1, deducted: t.deducted + (l.value === null ? 0 : 1), value: t.value + (l.value ?? 0) }),
    { sessions: 0, deducted: 0, value: 0 },
  )
}

/** Per teaching coach (who taught the session, which may be a substitute). */
export function byCoach(lines: SessionLine[]): Map<ID | undefined, Totals> {
  const groups = new Map<ID | undefined, SessionLine[]>()
  for (const l of lines) groups.set(l.workout.coachId, [...(groups.get(l.workout.coachId) ?? []), l])
  return new Map([...groups].map(([coachId, ls]) => [coachId, totals(ls)]))
}

export interface PaymentMonth {
  /** 0–11. */
  month: number
  total: number
  /** Newest first. */
  payments: SessionPackage[]
}

/** What students paid in a year, by month: a package's amount falls in the month it was bought. Free packages aren't payments. */
export function yearPayments(packages: SessionPackage[], year: number): PaymentMonth[] {
  const months: PaymentMonth[] = Array.from({ length: 12 }, (_, month) => ({ month, total: 0, payments: [] }))
  for (const p of packages) {
    const date = new Date(p.purchaseDate)
    if (p.priceTwd <= 0 || date.getFullYear() !== year) continue
    months[date.getMonth()].total += p.priceTwd
    months[date.getMonth()].payments.push(p)
  }
  for (const m of months) m.payments.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
  return months
}

/** From the year's first payment to the last finished month: months before they had any, or not over yet, don't count as quiet ones. */
export function comparableMonths(months: PaymentMonth[], year: number, today: Date): PaymentMonth[] {
  const first = months.findIndex((m) => m.payments.length > 0)
  if (first < 0 || year > today.getFullYear()) return []
  return months.slice(first, year < today.getFullYear() ? 12 : today.getMonth())
}

export const twd = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`
