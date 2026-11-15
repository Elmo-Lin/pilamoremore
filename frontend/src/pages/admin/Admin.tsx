import { ArrowLeft, Building2, Gift, Search, UserRound, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { adminOverview, adminUsers, grantComplimentary, revokeComplimentary, type AdminOverview, type AdminUser, type AdminWorkspace } from '../../api/admin'
import { isApiMode } from '../../api/client'
import { Legend, SignupChart, type SignupBucket } from '../../components/progress/Charts'
import { SIGNUP_SERIES } from '../../components/progress/chartColors'
import { Button } from '../../components/ui/Button'
import { Segmented, TextInput } from '../../components/ui/Form'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from '../../components/ui/Primitives'
import { PageLoading } from '../../components/ui/PageLoading'
import { addDays, formatDate, relativeDay, startOfDay, startOfWeek, twd } from '../../lib/format'
import { homePath } from '../../lib/roles'
import { useSession, useToast } from '../../store/contexts'
import type { BillingStatus } from '../../types'

const KIND_LABEL = { studio: '工作室' } as const
const STATUS: Record<BillingStatus, { label: string; tone: 'accent' | 'warn' | 'neutral' | 'alt' }> = {
  trialing: { label: '試用中', tone: 'accent' },
  active: { label: '付費中', tone: 'alt' },
  past_due: { label: '扣款失敗', tone: 'warn' },
  canceled: { label: '已取消', tone: 'neutral' },
  expired: { label: '已到期', tone: 'warn' },
  complimentary: { label: '永久版', tone: 'alt' },
}
type Filter = 'all' | 'unused' | BillingStatus
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'trialing', label: '試用中' },
  { value: 'active', label: '付費中' },
  { value: 'past_due', label: '扣款失敗' },
  { value: 'expired', label: '已到期' },
  { value: 'canceled', label: '已取消' },
  { value: 'complimentary', label: '永久版' },
  { value: 'unused', label: '未使用' },
]

type View = 'workspaces' | 'users'
const VIEWS: { value: View; label: string }[] = [
  { value: 'workspaces', label: '工作空間' },
  { value: 'users', label: '用戶' },
]

const USER_KIND: Record<AdminUser['kind'], string> = { owner: '經營者', studioCoach: '老師', student: '學員' }
type UserFilter = 'all' | AdminUser['kind']
const USER_FILTERS: UserFilter[] = ['all', 'owner', 'studioCoach', 'student']
type UserSort = 'seen' | 'joined'
const USER_SORTS: { value: UserSort; label: string }[] = [
  { value: 'seen', label: '最近上線' },
  { value: 'joined', label: '最新註冊' },
]
const isCoachKind = (k: AdminUser['kind']) => k === 'owner' || k === 'studioCoach'

type Span = '7d' | '30d' | '12w'
const SPANS: { value: Span; label: string }[] = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '12w', label: '近 12 週' },
]

/**
 * Sign-ups per day (last 7 or 30) or week (last 12), by account type. A sign-up is someone who made
 * an account of their own: the workspaces in use, dated by when they were made (invited people
 * aren't sign-ups).
 */
function signupBuckets(spaces: AdminWorkspace[], span: Span, now = new Date()): SignupBucket[] {
  const weekly = span === '12w'
  const start = weekly ? startOfWeek(now) : startOfDay(now)
  const count = weekly ? 12 : span === '7d' ? 7 : 30
  const buckets = Array.from({ length: count }, (_, i) => {
    const at = addDays(start, -(count - 1 - i) * (weekly ? 7 : 1))
    const label = `${at.getMonth() + 1}/${at.getDate()}`
    return { at: at.getTime(), bucket: { label, title: weekly ? `${label} 當週` : label, studio: 0, solo: 0, self: 0 } }
  })
  const index = new Map(buckets.map((b, i) => [b.at, i]))
  for (const w of spaces) {
    if (!w.createdAt) continue
    const key = (weekly ? startOfWeek(w.createdAt) : startOfDay(w.createdAt)).getTime()
    const i = index.get(key)
    if (i != null) buckets[i].bucket[w.kind]++
  }
  return buckets.map((b) => b.bucket)
}

/** /admin: who uses Pila More More and on what terms; 永久版 for friends. Only for the service owner. */
export function AdminPage() {
  const { session } = useSession()
  const notify = useToast()
  const token = session?.token
  const [data, setData] = useState<AdminOverview | null>(null)
  const [denied, setDenied] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [granting, setGranting] = useState<AdminWorkspace | null>(null)
  const [revoking, setRevoking] = useState<AdminWorkspace | null>(null)
  const [span, setSpan] = useState<Span>('7d')
  const [view, setView] = useState<View>('workspaces')

  // Bumped after a change, to fetch the overview again.
  const [version, setVersion] = useState(0)
  const load = () => setVersion((v) => v + 1)
  useEffect(() => {
    if (!token) return
    let live = true
    adminOverview(token)
      .then((d) => live && setData(d))
      .catch(() => live && setDenied(true))
    return () => {
      live = false
    }
  }, [token, version])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.workspaces ?? [])
      // Unused workspaces (their owner moved into someone else's) only under their own filter.
      .filter((w) => (filter === 'unused' ? !w.inUse : w.inUse && (filter === 'all' || w.status === filter)))
      .filter((w) => !needle || [w.name, w.ownerName, w.ownerEmail].some((x) => x?.toLowerCase().includes(needle)))
  }, [data, filter, q])

  // Who signed up themselves: the workspaces in use (the people in them were invited).
  const signedUp = useMemo(() => (data?.workspaces ?? []).filter((w) => w.inUse), [data])
  const buckets = useMemo(() => signupBuckets(signedUp, span), [signedUp, span])

  if (!isApiMode || !session) return <Navigate to="/" replace />
  if (denied) return <Navigate to={homePath(session.role)} replace />
  if (!data) return <PageLoading />

  const count = (s: BillingStatus) => data.workspacesByStatus[s] ?? 0
  // Older servers sent neither (deploy order): count nothing rather than fail.
  const ownersBy = data.owners ?? {}
  const membersBy = data.members ?? {}
  const owners = Object.values(ownersBy).reduce((a, b) => a + b, 0)
  const members = Object.values(membersBy).reduce((a, b) => a + b, 0)
  const unused = data.workspaces.filter((w) => !w.inUse).length

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pt-6 pb-16 md:px-8">
      <Link to={homePath(session.role)} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" />
        回到 App
      </Link>
      <PageHeader title="後台管理" />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="註冊人數"
          value={owners}
          unit="人"
          icon={UserRound}
        />
        <Stat
          label="受邀帳號"
          value={members}
          unit="人"
          icon={Users}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="近期註冊"
          action={<Segmented label="期間" size="sm" value={span} onChange={setSpan} options={SPANS} />}
        />
        <div className="px-5">
          <Legend items={SIGNUP_SERIES.map((x) => ({ color: x.color, label: x.label }))} />
        </div>
        <div className="px-3 pt-2 pb-4">
          <SignupChart buckets={buckets} />
        </div>
      </Card>

      <div className="mt-6">
        <Segmented label="列表" value={view} onChange={setView} options={VIEWS} />
      </div>

      {view === 'users' && token ? (
        <UsersPanel token={token} />
      ) : (
        <Card className="mt-3">
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="依狀態篩選">
              {FILTERS.map((f) => {
                const n = f.value === 'all' ? owners : f.value === 'unused' ? unused : count(f.value)
                if (f.value === 'unused' && !n) return null
                const active = filter === f.value
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.value)}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${active ? 'bg-accent-600 text-white' : 'bg-fill text-ink-800 hover:bg-fill-hover'}`}
                  >
                    {f.label}
                    <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? 'bg-white/25' : 'bg-chip text-ink-500'}`}>{n}</span>
                  </button>
                )
              })}
            </div>
            <label className="relative md:ml-auto md:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋名稱或 Email"
                aria-label="搜尋名稱或 Email"
                className="h-9 w-full rounded-lg bg-fill pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
              />
            </label>
          </div>
          {list.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {list.map((w) => (
                <li key={w.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 md:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium text-ink-900">
                      <span className="truncate">{w.name || '（未命名）'}</span>
                      <Badge>{KIND_LABEL[w.kind]}</Badge>
                      {w.inUse ? <Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge> : <Badge>未使用</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {w.ownerEmail}
                      {!w.inUse && '・帳號已移到其他工作空間'}
                      {`・學員 ${w.activeStudents}・老師 ${w.coaches}`}
                      {w.createdAt && `・${formatDate(w.createdAt, { year: true })} 建立`}
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-xs text-ink-600 sm:w-40 sm:text-right">
                    {w.status === 'trialing' && w.trialEndsAt && `試用到 ${formatDate(w.trialEndsAt)}`}
                    {(w.status === 'active' || w.status === 'past_due') && `${twd(w.monthlyAmount)}/月・${w.currentPeriodEnd ? formatDate(w.currentPeriodEnd) + ' 扣款' : ''}`}
                    {w.status === 'canceled' && w.currentPeriodEnd && `可用到 ${formatDate(w.currentPeriodEnd)}`}
                    {w.status === 'complimentary' && (w.extraStudentPacks || w.extraCoachSeats ? `加購學員 ${w.extraStudentPacks} 組・老師 ${w.extraCoachSeats} 位` : '永久免費')}
                  </p>
                  <div className="shrink-0">
                    {w.status === 'complimentary' ? (
                      <Button variant="ghost" size="sm" onClick={() => setRevoking(w)}>
                        取消永久版
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" icon={Gift} onClick={() => setGranting(w)}>
                        設為永久版
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Building2} title="沒有符合的工作空間" />
          )}
        </Card>
      )}

      {granting && token && (
        <GrantModal
          workspace={granting}
          onClose={() => setGranting(null)}
          onGrant={async (extras) => {
            try {
              await grantComplimentary(granting.id, extras, token)
              notify(`${granting.name} 已設為永久版`)
              setGranting(null)
              load()
            } catch (e) {
              notify(e instanceof Error ? e.message : '設定失敗', 'error')
            }
          }}
        />
      )}
      <ConfirmDialog
        open={!!revoking}
        title={`取消「${revoking?.name}」的永久版？`}
        description="取消後有 7 天可以訂閱，之後轉為唯讀。資料都會保留。"
        confirmLabel="取消永久版"
        tone="danger"
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking || !token) return
          try {
            await revokeComplimentary(revoking.id, token)
            notify(`已取消 ${revoking.name} 的永久版`, 'info')
            setRevoking(null)
            load()
          } catch (e) {
            notify(e instanceof Error ? e.message : '取消失敗', 'error')
          }
        }}
      />
    </div>
  )
}

/**
 * Every account and how much it uses the app: when they last opened it, and for coaches the students
 * they look after and classes they led, for students their own workouts. Counts only.
 */
function UsersPanel({ token }: { token: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<UserFilter>('all')
  const [sort, setSort] = useState<UserSort>('seen')
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    adminUsers(token)
      .then((u) => live && setUsers(u))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [token])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const at = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
    return (users ?? [])
      .filter((u) => filter === 'all' || u.kind === filter)
      .filter((u) => !needle || [u.name, u.email, u.workspaceName].some((x) => x?.toLowerCase().includes(needle)))
      .sort((a, b) => (sort === 'seen' ? at(b.lastSeenAt) - at(a.lastSeenAt) : 0) || at(b.createdAt) - at(a.createdAt))
  }, [users, filter, sort, q])

  if (failed) return <EmptyState icon={Users} title="無法載入用戶" description="伺服器可能還沒更新到這個版本。" />
  if (!users) return <PageLoading />

  return (
    <Card className="mt-3">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="依身分篩選">
          {USER_FILTERS.map((k) => {
            const n = k === 'all' ? users.length : users.filter((u) => u.kind === k).length
            const active = filter === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(k)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${active ? 'bg-accent-600 text-white' : 'bg-fill text-ink-800 hover:bg-fill-hover'}`}
              >
                {k === 'all' ? '全部' : USER_KIND[k]}
                <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? 'bg-white/25' : 'bg-chip text-ink-500'}`}>{n}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <Segmented label="排序" size="sm" value={sort} onChange={setSort} options={USER_SORTS} />
          <label className="relative min-w-0 flex-1 md:w-56 md:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋姓名、Email 或工作室"
              aria-label="搜尋姓名、Email 或工作室"
              className="h-9 w-full rounded-lg bg-fill pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
          </label>
        </div>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((u) => (
            <li key={u.id} className="flex flex-col gap-1.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 md:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium text-ink-900">
                  <span className="truncate">{u.name || '（未命名）'}</span>
                  <Badge>{USER_KIND[u.kind]}</Badge>
                  {u.login === 'none' && <Badge tone="warn">未開通</Badge>}
                  {!u.active && <Badge>已停用</Badge>}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {[u.email, u.workspaceName, u.createdAt && `${formatDate(u.createdAt, { year: true })} 加入`].filter(Boolean).join('・')}
                </p>
              </div>
              <div className="tabular shrink-0 text-xs text-ink-600 sm:w-56 sm:text-right">
                <p className="font-medium text-ink-800">{u.lastSeenAt ? `上線：${relativeDay(u.lastSeenAt)}` : '上線：尚無紀錄'}</p>
                <p>
                  {isCoachKind(u.kind)
                    ? `負責學員 ${u.students}・近 30 天帶 ${u.workouts30d} 堂`
                    : `近 30 天練習 ${u.workouts30d} 次${u.lastWorkoutAt ? `・上次 ${relativeDay(u.lastWorkoutAt)}` : ''}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={Users} title="沒有符合的用戶" />
      )}
    </Card>
  )
}

/** Free for good, with how many extra students (and coaches, for a studio) it may have. */
function GrantModal({ workspace: w, onClose, onGrant }: { workspace: AdminWorkspace; onClose: () => void; onGrant: (extras: { extraStudentPacks: number; extraCoachSeats: number }) => Promise<void> }) {
  const [packs, setPacks] = useState(String(w.extraStudentPacks))
  const [seats, setSeats] = useState(String(w.extraCoachSeats))
  const [busy, setBusy] = useState(false)
  const included = w.kind === 'studio' ? '含 100 位學員、3 位老師' : w.kind === 'solo' ? '含 30 位學員' : '自主練習（一人）'
  const num = (v: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)))
  return (
    <Modal
      open
      onClose={onClose}
      title={`將「${w.name}」設為永久版`}
      description={`不會到期、不會扣款；${included}。若正在訂閱，會同時停止扣款。之後升級方案也維持永久版。`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" className="h-11 md:h-10" onClick={onClose}>
            取消
          </Button>
          <Button
            className="h-11 md:h-10"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onGrant({ extraStudentPacks: num(packs, 100), extraCoachSeats: num(seats, 50) })
              setBusy(false)
            }}
          >
            {busy ? '處理中…' : '設為永久版'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="加購學員（每組 10 位）" type="number" inputMode="numeric" min={0} max={100} value={packs} onChange={(e) => setPacks(e.target.value)} hint={`目前 ${w.activeStudents} 位活躍學員`} />
        <TextInput label="加購老師名額" type="number" inputMode="numeric" min={0} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} hint={`目前 ${w.coaches} 位老師`} />
      </div>
    </Modal>
  )
}
