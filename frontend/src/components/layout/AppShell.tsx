import {
  Building2,
  CalendarDays,
  CreditCard,
  Dumbbell,
  History,
  House,
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BRAND } from '../../config/brand'
import { syncPushDevice } from '../../lib/push'
import { homePath } from '../../lib/roles'
import { useScrollTopIfCurrent } from '../../lib/scroll'
import { useData, useSession } from '../../store/contexts'
import { PageLoading } from '../ui/PageLoading'
import { BillingBanner } from './BillingBanner'
import { RoleSwitcher } from './RoleSwitcher'

interface NavItem {
  to: string
  label: string
  short?: string
  icon: LucideIcon
  end?: boolean
  primary?: boolean
  /** Sidebar only: the phone tab bar holds at most 5 items. */
  desktopOnly?: boolean
  /** Also highlighted on pages under this path (reached from this section). */
  alsoActive?: string
}

const COACH_NAV: NavItem[] = [
  { to: '/coach', label: '總覽', icon: LayoutDashboard, end: true },
  // Workouts are started from a student (their page, today's schedule), so the logger sits under 學員.
  { to: '/coach/students', label: '學員', icon: Users, alsoActive: '/coach/workouts' },
  { to: '/coach/schedule', label: '課表', icon: CalendarDays },
]

/** Owners and free coaches: each month's sessions and what they were worth. Phones reach it from the account menu. */
const REVENUE_ITEM: NavItem = { to: '/coach/revenue', label: '業績報表', icon: ReceiptText, desktopOnly: true }

/** Owners manage their studio here; free coaches can upgrade from it. Phones reach it from the account menu. */
const STUDIO_ITEM: NavItem = { to: '/coach/studio', label: '工作室', icon: Building2, desktopOnly: true }
const BILLING_ITEM: NavItem = { to: '/coach/billing', label: '方案與付款', icon: CreditCard, desktopOnly: true }

/** The phone tab bar spreads its 3–5 tabs across the width. */
const TAB_COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }

const STUDENT_NAV: NavItem[] = [
  { to: '/student', label: '首頁', icon: House, end: true },
  { to: '/student/plan', label: '我的課表', short: '課表', icon: CalendarDays },
  { to: '/student/workouts/new', label: '自主練習', short: '練習', icon: Dumbbell, primary: true },
  { to: '/student/history', label: '上課紀錄', short: '紀錄', icon: History },
  { to: '/student/progress', label: '進步追蹤', short: '進步', icon: TrendingUp },
]

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex size-7 items-center justify-center rounded-[7px] bg-accent-600">
        <svg viewBox="0 0 32 32" className="size-4.5" aria-hidden>
          {/* A Pilates Reformer (核心床) from the side, drawn like Lift More More's barbell: footbar, carriage, frame on legs. */}
          <rect x="12.8" y="13" width="11.2" height="4" rx="2" fill="#ffffff" />
          <path d="M4.8 19.8h22.4M7.2 19.8v2.6M24.8 19.8v2.6M8.6 19.8v-7.6a2.4 2.4 0 0 1 2.4-2.4h1.2" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink-900">{BRAND.name}</span>
    </span>
  )
}

/** The logo inside the app: back to the signed-in user's home (coach overview, or the student home). */
function HomeLogo() {
  const { session } = useSession()
  const home = homePath(session?.role)
  const onClick = useScrollTopIfCurrent(home)
  return (
    <Link to={home} onClick={onClick} aria-label="回到主畫面" className="-m-1 rounded-lg p-1">
      <Logo />
    </Link>
  )
}

/** Whether the page has scrolled away from the top (drives the top bar's scroll-edge appearance). */
function useScrolled() {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

/**
 * Phone top bar with the logo. Fixed, not sticky, so it
 * stays put during iOS rubber-band overscroll like a native nav bar; pages pad their content by
 * its 3rem height. Scroll-edge style: page-coloured at the top (blending into the status bar, which
 * shows the page background in the installed app), material + hairline once content scrolls under it.
 */
export function MobileTopBar({ children }: { children?: React.ReactNode }) {
  const scrolled = useScrolled()
  return (
    <header
      data-topbar
      className={`fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b px-4 transition-[background-color,border-color] duration-200 md:hidden ${
        scrolled ? 'material border-hairline' : 'border-transparent bg-canvas'
      }`}
    >
      <HomeLogo />
      {children}
    </header>
  )
}

export function AppShell() {
  const { session } = useSession()
  const { data } = useData()
  // A device that allowed class reminders reports to whoever is signed in on it now.
  const token = session?.token
  useEffect(() => {
    if (token) void syncPushDevice(token)
  }, [token])
  const showStudio = session?.role === 'owner'
  // The owner runs the business side: studio, revenue, billing.
  const coachNav = [...COACH_NAV, ...(showStudio ? [REVENUE_ITEM, STUDIO_ITEM] : []), ...(data.billing ? [BILLING_ITEM] : [])]
  const nav = session?.role === 'student' ? STUDENT_NAV : coachNav
  const tabBar = nav.filter((item) => !item.desktopOnly)
  const { pathname } = useLocation()
  const active = (item: NavItem, isActive: boolean) => isActive || (!!item.alsoActive && pathname.startsWith(item.alsoActive))

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-sidebar px-3 py-5 md:flex">
        <div className="px-2 pb-6">
          <HomeLogo />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="主要導覽">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors ${
                  active(item, isActive) ? 'bg-selected font-medium text-ink-900' : 'text-ink-800 hover:bg-hover'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-4 text-accent-600" strokeWidth={active(item, isActive) ? 2.25 : 2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <RoleSwitcher placement="sidebar" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar>
          <RoleSwitcher placement="topbar" />
        </MobileTopBar>

        {/* pt-17 on phones: the top bar's 3rem plus 1.25rem of breathing room. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-17 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-12">
          <BillingBanner />
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        data-tabbar
        aria-label="主要導覽"
        className={`material fixed inset-x-0 bottom-0 z-40 grid ${TAB_COLS[tabBar.length] ?? 'grid-cols-5'} border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden`}
      >
        {tabBar.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              // Dims while pressed, so a tap shows at once even before the page changes.
              `flex h-12.5 flex-col items-center justify-center gap-0 text-[10px] font-medium transition-opacity active:opacity-50 ${active(item, isActive) ? 'text-accent-600' : 'text-ink-400'}`
            }
          >
            {({ isActive }) =>
              <>
                <span className="inline-flex h-7 items-center">
                  <item.icon className="size-6" strokeWidth={active(item, isActive) ? 2.1 : 1.75} />
                </span>
                {item.short ?? item.label}
              </>
            }
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
