import { ChevronDown, ChevronLeft, ChevronRight, Download, ReceiptText, Ticket, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { PaymentChart } from '../../components/progress/Charts'
import { Button, IconButton } from '../../components/ui/Button'
import { Avatar, Badge, Card, CardHeader, DemoNotice, EmptyState, PageHeader, Stat, Tabs } from '../../components/ui/Primitives'
import { formatDate, formatTime } from '../../lib/format'
import { byCoach, comparableMonths, monthSessions, pricePerSession, totals, twd, yearPayments, type PaymentMonth, type SessionLine } from '../../lib/revenue'
import { workoutDate } from '../../lib/stats'
import { useData, useSession } from '../../store/contexts'
import { selectCoachName, selectIsStudio, selectStudent } from '../../store/selectors'
import type { AppData, ID, SessionPackage } from '../../types'

type ReportTab = 'sessions' | 'payments'

/** Owners and free coaches: what the sessions given were worth, and what students paid. */
export function RevenuePage() {
  const { data } = useData()
  const role = useSession().session?.role
  const [tab, setTab] = useState<ReportTab>('sessions')
  if (!(role === 'owner' || (role === 'coach' && !selectIsStudio(data)))) return <Navigate to="/coach" replace />

  const tabs = (
    <div className="mb-4">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'sessions', label: '課程業績' },
          { value: 'payments', label: '學員繳費' },
        ]}
      />
    </div>
  )
  return tab === 'sessions' ? <SessionReport tabs={tabs} /> : <PaymentReport tabs={tabs} />
}

/** What each month's sessions were worth, from the packages they were deducted from. */
function SessionReport({ tabs }: { tabs: ReactNode }) {
  const { data } = useData()
  const studio = selectIsStudio(data)
  const today = new Date()
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  /** Studios: show one teaching coach's sessions; null = everyone. */
  const [coachFilter, setCoachFilter] = useState<{ id: ID | undefined } | null>(null)

  const lines = monthSessions(data, month.year, month.month)
  const sum = totals(lines)
  const coaches = [...byCoach(lines)].sort((a, b) => b[1].value - a[1].value)
  const isCurrent = month.year === today.getFullYear() && month.month === today.getMonth()
  const step = (n: number) => setMonth(({ year, month: m }) => ({ year: year + Math.floor((m + n) / 12), month: (((m + n) % 12) + 12) % 12 }))
  const label = `${month.year} 年 ${month.month + 1} 月`
  const coachName = (id: ID | undefined) => selectCoachName(data, id) || '已離開的老師'
  const shown = coachFilter ? lines.filter((l) => l.workout.coachId === coachFilter.id) : lines
  const pickCoach = (id: ID | undefined) => setCoachFilter(coachFilter && coachFilter.id === id ? null : { id })
  // Every coach with sessions this month, plus the chosen one even when they had none.
  const chips = [...coaches.map(([id]) => id), ...(coachFilter && !coaches.some(([id]) => id === coachFilter.id) ? [coachFilter.id] : [])]

  return (
    <div>
      <PageHeader
        title="業績報表"
        description="依上課日期統計私人課。每堂金額 = 扣堂所用方案的金額 ÷ 方案堂數。"
        actions={
          <Button
            variant="secondary"
            icon={Download}
            disabled={!shown.length}
            onClick={() => downloadCsv(data, shown, coachFilter ? `${label}-${coachName(coachFilter.id)}` : label)}
          >
            匯出 CSV
          </Button>
        }
      />

      {tabs}

      <div className="mb-4 flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="上個月" onClick={() => step(-1)} />
        <p className="tabular min-w-32 text-center text-[17px] font-semibold text-ink-900">{label}</p>
        <IconButton icon={ChevronRight} label="下個月" onClick={() => step(1)} disabled={isCurrent} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="上課堂數" value={sum.sessions} unit="堂" icon={ReceiptText} sub="已完成的私人課" />
        <Stat
          label="已扣堂"
          value={sum.deducted}
          unit="堂"
          icon={Ticket}
          tone={sum.sessions > sum.deducted ? 'warn' : 'default'}
          sub={sum.sessions > sum.deducted ? `${sum.sessions - sum.deducted} 堂尚未扣堂，不計入金額` : '全部已扣堂'}
        />
        <Stat label="課程金額" value={twd(sum.value)} icon={Wallet} sub="已扣堂的課，依方案單價計算" />
      </div>

      {studio && coaches.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="各老師" description="依實際上課的老師計算（代課算代課老師）・點一位只看他的明細" />
          <ul className="divide-y divide-line border-t border-line">
            {coaches.map(([coachId, t]) => {
              const name = coachName(coachId)
              const active = coachFilter?.id === coachId
              return (
                <li key={coachId ?? 'none'}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickCoach(coachId)}
                    className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${active ? 'bg-accent-50' : 'hover:bg-subtle'}`}
                  >
                    <Avatar name={name} id={coachId} size="sm" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{name}</p>
                    <p className="tabular text-sm text-ink-600">
                      {t.sessions} 堂{t.sessions > t.deducted ? `（${t.sessions - t.deducted} 堂未扣）` : ''}
                    </p>
                    <p className="tabular w-28 text-right text-sm font-semibold text-ink-900">{twd(t.value)}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader
          title="每堂明細"
          description={`${label}${coachFilter ? `・${coachName(coachFilter.id)}` : ''}・共 ${shown.length} 堂${coachFilter ? `・${twd(totals(shown).value)}` : ''}`}
        />
        {studio && chips.length > 1 && (
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-5 pb-3" role="group" aria-label="依老師篩選">
            {[undefined, ...chips].map((id, i) => {
              const all = i === 0
              const active = all ? !coachFilter : coachFilter?.id === id
              const count = all ? lines.length : lines.filter((l) => l.workout.coachId === id).length
              return (
                <button
                  key={all ? 'all' : (id ?? 'none')}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (all ? setCoachFilter(null) : setCoachFilter({ id }))}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
                    active ? 'bg-accent-600 text-white' : 'bg-fill text-ink-800 hover:bg-fill-hover'
                  }`}
                >
                  {all ? '全部' : coachName(id)}
                  <span className={`tabular rounded-full px-1.5 text-[11px] ${active ? 'bg-white/25' : 'bg-chip text-ink-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
        {shown.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {shown.map((l) => (
              <SessionRow key={l.workout.id} line={l} data={data} showCoach={studio} />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={ReceiptText} title={coachFilter ? `${coachName(coachFilter.id)} 這個月沒有完成的私人課` : '這個月沒有完成的私人課'} />
        )}
      </Card>
      <DemoNotice className="mt-6 text-center" />
    </div>
  )
}

/** What students paid over a year, to see the busy and quiet months. */
function PaymentReport({ tabs }: { tabs: ReactNode }) {
  const { data } = useData()
  const today = new Date()
  const thisYear = today.getFullYear()
  const [year, setYear] = useState(thisYear)
  const [open, setOpen] = useState<number | null>(null)

  const months = yearPayments(data.packages, year)
  const payments = months.flatMap((m) => m.payments)
  const total = months.reduce((sum, m) => sum + m.total, 0)
  const compared = comparableMonths(months, year, today)
  const average = compared.length ? compared.reduce((sum, m) => sum + m.total, 0) / compared.length : 0
  const highest = compared.reduce<PaymentMonth | null>((best, m) => (!best || m.total > best.total ? m : best), null)
  const lowest = compared.reduce<PaymentMonth | null>((best, m) => (!best || m.total < best.total ? m : best), null)
  const canCompare = compared.length > 1
  // Months still to come are left out unless a payment was dated in them.
  const listed = months.filter((m) => m.payments.length > 0 || year < thisYear || m.month <= today.getMonth())
  const step = (n: number) => {
    setYear(year + n)
    setOpen(null)
  }

  return (
    <div>
      <PageHeader
        title="業績報表"
        description="依購買日期統計課程方案的金額，看每月收款與淡旺季。金額為 0 的方案不計入。"
        actions={
          <Button variant="secondary" icon={Download} disabled={!payments.length} onClick={() => downloadPaymentsCsv(data, payments, year)}>
            匯出 CSV
          </Button>
        }
      />

      {tabs}

      <div className="mb-4 flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="上一年" onClick={() => step(-1)} />
        <p className="tabular min-w-32 text-center text-[17px] font-semibold text-ink-900">{year} 年</p>
        <IconButton icon={ChevronRight} label="下一年" onClick={() => step(1)} disabled={year >= thisYear} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="全年繳費" value={twd(total)} icon={Wallet} sub={`共 ${payments.length} 筆${compared.length ? `・月平均 ${twd(average)}` : ''}`} />
        <Stat
          label="最高月份"
          value={canCompare && highest ? `${highest.month + 1} 月` : '—'}
          icon={TrendingUp}
          sub={canCompare && highest ? twd(highest.total) : '至少要兩個完整月份才能比較'}
        />
        <Stat
          label="最低月份"
          value={canCompare && lowest ? `${lowest.month + 1} 月` : '—'}
          icon={TrendingDown}
          sub={canCompare && lowest ? twd(lowest.total) : '至少要兩個完整月份才能比較'}
        />
      </div>

      {payments.length ? (
        <>
          <Card className="mt-4">
            <CardHeader title="每月繳費" description={`${year} 年・點長條看該月明細`} />
            <div className="px-3 pb-4 md:px-5">
              <PaymentChart months={months} onSelect={setOpen} />
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="各月明細" description="點月份展開每筆繳費" />
            <ul className="divide-y divide-line border-t border-line">
              {listed.map((m) => (
                <PaymentMonthRow key={m.month} month={m} data={data} open={open === m.month} onToggle={() => setOpen(open === m.month ? null : m.month)} />
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card className="mt-4">
          <EmptyState compact icon={Wallet} title={`${year} 年還沒有繳費紀錄`} description="到學員的「課程方案」新增方案並填寫金額，就會統計在這裡。" />
        </Card>
      )}
      <DemoNotice className="mt-6 text-center" />
    </div>
  )
}

function PaymentMonthRow({ month: m, data, open, onToggle }: { month: PaymentMonth; data: AppData; open: boolean; onToggle: () => void }) {
  const empty = m.payments.length === 0
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        disabled={empty}
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${open ? 'bg-accent-50' : empty ? '' : 'hover:bg-subtle'}`}
      >
        <p className="tabular w-12 shrink-0 text-sm font-medium text-ink-900">{m.month + 1} 月</p>
        <p className="tabular flex-1 text-sm text-ink-500">{empty ? '沒有繳費' : `${m.payments.length} 筆`}</p>
        <p className={`tabular text-sm font-semibold ${empty ? 'text-ink-400' : 'text-ink-900'}`}>{twd(m.total)}</p>
        <ChevronDown className={`size-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''} ${empty ? 'invisible' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line">
          {m.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3 pr-5 pl-8">
              <span className="tabular w-12 shrink-0 text-sm text-ink-600">{formatDate(p.purchaseDate)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{selectStudent(data, p.studentId)?.name ?? '已刪除的學員'}</p>
                <p className="truncate text-xs text-ink-500">
                  {p.name}・{p.totalSessions} 堂
                </p>
              </div>
              <p className="tabular text-sm font-semibold text-ink-900">{twd(p.priceTwd)}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function SessionRow({ line, data, showCoach }: { line: SessionLine; data: AppData; showCoach: boolean }) {
  const { workout: w, pkg, value } = line
  const student = selectStudent(data, w.studentId)
  const when = workoutDate(w)
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="tabular w-16 shrink-0 text-sm text-ink-600">
        {formatDate(when)}
        <span className="block text-xs text-ink-400">{formatTime(w.startedAt)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">
          {student?.name ?? '已刪除的學員'}
          {showCoach && <span className="font-normal text-ink-500">・{selectCoachName(data, w.coachId) || '—'}</span>}
        </p>
        <p className="truncate text-xs text-ink-500">
          {pkg ? `${pkg.name}・${twd(pkg.priceTwd)} ÷ ${pkg.totalSessions} 堂` : value === null ? w.title : '方案已刪除'}
        </p>
      </div>
      {value === null ? <Badge tone="warn">未扣堂</Badge> : <p className="tabular text-sm font-semibold text-ink-900">{twd(value)}</p>}
    </li>
  )
}

/** For the accountant: one row per session, opened directly by Excel (UTF-8 with BOM). */
function downloadCsv(data: AppData, lines: SessionLine[], label: string) {
  const rows = [
    ['日期', '時間', '學員', '授課老師', '練習', '扣堂方案', '方案金額', '方案堂數', '每堂金額'],
    ...lines.map(({ workout: w, pkg, value }) => [
      formatDate(workoutDate(w), { year: true }),
      formatTime(w.startedAt),
      selectStudent(data, w.studentId)?.name ?? '已刪除的學員',
      selectCoachName(data, w.coachId),
      w.title,
      pkg?.name ?? (value === null ? '未扣堂' : '方案已刪除'),
      pkg?.priceTwd ?? '',
      pkg?.totalSessions ?? '',
      pkg ? Math.round(pricePerSession(pkg)) : '',
    ]),
  ]
  saveCsv(rows, `業績報表-${label.replace(/\s/g, '')}.csv`)
}

/** One row per payment, oldest first. */
function downloadPaymentsCsv(data: AppData, payments: SessionPackage[], year: number) {
  const rows = [
    ['繳費日期', '學員', '方案', '堂數', '金額', '備註'],
    ...[...payments]
      .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
      .map((p) => [formatDate(p.purchaseDate, { year: true }), selectStudent(data, p.studentId)?.name ?? '已刪除的學員', p.name, p.totalSessions, p.priceTwd, p.notes ?? '']),
  ]
  saveCsv(rows, `學員繳費-${year}年.csv`)
}

function saveCsv(rows: (string | number)[][], name: string) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
