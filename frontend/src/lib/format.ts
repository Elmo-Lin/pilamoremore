import type { Equipment, Gender, MuscleGroup, TrainingGoal } from '../types'

const DAY = 24 * 60 * 60 * 1000
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export const twd = (n: number) => `NT$ ${Math.round(n).toLocaleString('zh-TW')}`


/** Counts with thousands separators (e.g. 1,250). */
export const volumeNumber = (n: number) => Math.round(n).toLocaleString('zh-TW')

export function startOfDay(d: Date | string): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Monday-based week start. */
export function startOfWeek(d: Date | string): Date {
  const x = startOfDay(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return x
}

export const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * DAY)

export const isSameDay = (a: Date | string, b: Date | string) =>
  startOfDay(a).getTime() === startOfDay(b).getTime()

export function daysBetween(a: Date | string, b: Date | string) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)
}

export function formatDate(d: Date | string, opts: { year?: boolean; weekday?: boolean } = {}) {
  const x = new Date(d)
  const base = `${x.getMonth() + 1}/${x.getDate()}`
  const withYear = opts.year ? `${x.getFullYear()}/${base}` : base
  return opts.weekday ? `${withYear}（${WEEKDAYS[x.getDay()]}）` : withYear
}

export function formatTime(d: Date | string) {
  const x = new Date(d)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}

export function formatDateTime(d: Date | string) {
  return `${formatDate(d, { year: true })} ${formatTime(d)}`
}

export function relativeDay(d: Date | string, now = new Date()) {
  const diff = daysBetween(d, now)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === -1) return '明天'
  if (diff > 1 && diff < 7) return `${diff} 天前`
  if (diff < -1 && diff > -7) return `${-diff} 天後`
  return formatDate(d, { year: new Date(d).getFullYear() !== now.getFullYear() })
}

/** yyyy-mm-dd for <input type="date"> in local time. */
export function toDateInput(d: Date | string) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function fromDateInput(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toISOString()
}

export function durationMin(start: string, end?: string) {
  if (!end) return null
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

export const GOAL_LABEL: Record<TrainingGoal, string> = {
  core: '核心強化',
  posture: '體態改善',
  pain: '舒緩痠痛',
  flexibility: '柔軟度',
  postnatal: '產後修復',
  general: '健康維持',
}

export const GENDER_LABEL: Record<Gender, string> = {
  female: '女',
  male: '男',
  other: '其他',
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  legs: '腿部',
  back: '背部',
  chest: '胸部',
  shoulders: '肩部',
  arms: '手臂',
  glutes: '臀部',
  core: '核心',
  cardio: '有氧（跳板）',
}

/** "30 分鐘", "1 小時 5 分"; seconds only under a minute. */
export function duration(sec: number) {
  if (sec < 60) return `${Math.round(sec)} 秒`
  const min = Math.round(sec / 60)
  return min < 60 ? `${min} 分鐘` : `${Math.floor(min / 60)} 小時${min % 60 ? ` ${min % 60} 分` : ''}`
}

/** Running pace, e.g. 5'48"/km. */
export function pace(sec: number, km: number) {
  const perKm = Math.round(sec / km)
  return `${Math.floor(perKm / 60)}'${String(perKm % 60).padStart(2, '0')}"/km`
}

/** Speed for wheels and machines, e.g. 24.5 km/h. */
export function speed(sec: number, km: number) {
  return `${Math.round((km / (sec / 3600)) * 10) / 10} km/h`
}

/** Distance with at most two decimals: "5 km", "5.25 km". */
export const km = (n: number) => `${Math.round(n * 100) / 100} km`

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  reformer: '核心床',
  mat: '墊上',
  cadillac: '凱迪拉克',
  chair: '穩踏椅',
  barrel: '梯桶',
  props: '小道具',
  other: '其他',
}

export function givenName(name: string) {
  // Chinese names: last 2 chars (林子傑 → 子傑); latin: first word (Elmo Lin → Elmo).
  const trimmed = name.trim()
  if (/[一-鿿]/.test(trimmed)) return trimmed.slice(-2)
  return trimmed.split(/\s+/)[0]
}

export function initials(name: string) {
  // Chinese names: use the given name (last 1-2 chars); latin: first letters.
  if (/[一-鿿]/.test(name)) return name.slice(-2)
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
