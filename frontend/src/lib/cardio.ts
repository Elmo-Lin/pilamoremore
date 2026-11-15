// Cardio: the jump board, walks and runs (the 'cardio' group), logged as time (and optionally
// distance) per bout instead of springs × reps. Each completed set is one bout. Cardio never counts
// towards total reps or body-area balance.
import type { Exercise, ID, ISODate, SetLog, WorkoutSession } from '../types'
import { duration, km, pace, speed, startOfWeek } from './format'
import { workoutDate } from './stats'

export const isCardio = (e: Exercise | undefined) => e?.muscleGroup === 'cardio'

/** On foot: pace per km means something here (not on a bike, rower or in the pool). */
export const PACED = new Set<ID>(['px_run', 'px_walk'])

/** Pace on foot, speed otherwise; nothing without both time and distance. */
export function tempo(exerciseId: ID, sec: number | null | undefined, km: number | null | undefined) {
  if (!sec || !km) return null
  return PACED.has(exerciseId) ? { label: '配速', value: pace(sec, km) } : { label: '速度', value: speed(sec, km) }
}

/** "29 分鐘・4.8 km・配速 6'06"/km・心率 152・340 kcal": whatever was recorded. */
export function describeCardio(exerciseId: ID, s: SetLog) {
  const t = tempo(exerciseId, s.durationSec, s.distanceKm)
  return [
    s.durationSec ? duration(s.durationSec) : '',
    s.distanceKm ? km(s.distanceKm) : '',
    t ? `${t.label} ${t.value}` : '',
    s.avgHeartRate ? `心率 ${s.avgHeartRate}` : '',
    s.calories ? `${s.calories} kcal` : '',
  ]
    .filter(Boolean)
    .join('・')
}

/** Bouts that were done: ticked off with a time. */
export const cardioSets = (sets: SetLog[]) => sets.filter((s) => s.completed && (s.durationSec ?? 0) > 0)

export interface CardioTotals {
  /** Workouts with any cardio in them. */
  sessions: number
  sec: number
  km: number
}

export function cardioTotals(workouts: WorkoutSession[]): CardioTotals {
  let sessions = 0
  let sec = 0
  let km = 0
  for (const w of workouts) {
    if (w.status !== 'completed') continue
    let any = false
    for (const e of w.exercises) {
      for (const s of cardioSets(e.sets)) {
        any = true
        sec += s.durationSec ?? 0
        km += s.distanceKm ?? 0
      }
    }
    if (any) sessions++
  }
  return { sessions, sec, km }
}

/** One workout's cardio, for summaries like "有氧 30 分鐘". */
export const workoutCardioSec = (w: WorkoutSession) => w.exercises.reduce((n, e) => n + cardioSets(e.sets).reduce((m, s) => m + (s.durationSec ?? 0), 0), 0)

export interface CardioWeek {
  weekStart: string
  label: string
  minutes: number
  km: number
}

/** Cardio minutes and km per week over the last `weeks` weeks, empty weeks included. */
export function cardioWeekly(workouts: WorkoutSession[], weeks: number, now = new Date()): CardioWeek[] {
  const current = startOfWeek(now)
  const out: CardioWeek[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(current)
    ws.setDate(ws.getDate() - i * 7)
    out.push({ weekStart: ws.toISOString(), label: `${ws.getMonth() + 1}/${ws.getDate()}`, minutes: 0, km: 0 })
  }
  const index = new Map(out.map((b, i) => [startOfWeek(b.weekStart).getTime(), i]))
  for (const w of workouts) {
    if (w.status !== 'completed') continue
    const i = index.get(startOfWeek(workoutDate(w)).getTime())
    if (i == null) continue
    for (const e of w.exercises) {
      for (const s of cardioSets(e.sets)) {
        out[i].minutes += (s.durationSec ?? 0) / 60
        out[i].km += s.distanceKm ?? 0
      }
    }
  }
  return out.map((b) => ({ ...b, minutes: Math.round(b.minutes), km: Math.round(b.km * 100) / 100 }))
}

export interface CardioRecord {
  exerciseId: ID
  bouts: number
  /** Longest single bout. */
  longestSec: number
  longestSecDate: ISODate
  /** Farthest single bout, if distances were logged. */
  farthestKm?: number
  farthestKmDate?: ISODate
  /** Fastest pace on foot (seconds per km), from bouts of at least 1 km. */
  bestPaceSec?: number
  bestPaceDate?: ISODate
}

/** Per cardio exercise: the longest, the farthest and (on foot) the fastest bout. Most done first. */
export function cardioRecords(workouts: WorkoutSession[]): CardioRecord[] {
  const by = new Map<ID, CardioRecord>()
  for (const w of workouts) {
    if (w.status !== 'completed') continue
    const date = workoutDate(w)
    for (const e of w.exercises) {
      for (const s of cardioSets(e.sets)) {
        const sec = s.durationSec ?? 0
        const r = by.get(e.exerciseId) ?? { exerciseId: e.exerciseId, bouts: 0, longestSec: 0, longestSecDate: date }
        r.bouts++
        if (sec > r.longestSec) Object.assign(r, { longestSec: sec, longestSecDate: date })
        const dist = s.distanceKm ?? 0
        if (dist > 0 && dist > (r.farthestKm ?? 0)) Object.assign(r, { farthestKm: dist, farthestKmDate: date })
        if (PACED.has(e.exerciseId) && dist >= 1) {
          const p = sec / dist
          if (r.bestPaceSec == null || p < r.bestPaceSec) Object.assign(r, { bestPaceSec: p, bestPaceDate: date })
        }
        by.set(e.exerciseId, r)
      }
    }
  }
  return [...by.values()].sort((a, b) => b.bouts - a.bouts)
}
