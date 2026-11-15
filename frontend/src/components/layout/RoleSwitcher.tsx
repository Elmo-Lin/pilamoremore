import { ArrowLeftRight, Bell, Building2, CreditCard, LayoutDashboard, LogOut, Presentation, ReceiptText, RotateCcw, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { enterLocalDemo, exitLocalDemo, hasParkedAccount, isApiMode, isLocalDemo } from '../../api/client'
import { adminStatus } from '../../api/admin'
import { demoHome, demoPersonaOf, demoPersonaTitle, demoSession, type DemoPersona } from '../../data/mock'
import { BILLING_PATH } from '../../lib/billing'
import { isCoachRole, ROLE_LABEL } from '../../lib/roles'
import { useData, useSession, useToast } from '../../store/contexts'
import { selectIsStudio } from '../../store/selectors'
import { Button } from '../ui/Button'
import { ConfirmDialog, Modal } from '../ui/Modal'
import { Avatar } from '../ui/Primitives'
import { AppearancePicker } from './Appearance'
import { DemoPersonaList } from './DemoPersonas'
import { NotificationSettings } from './NotificationSettings'

type Placement = 'sidebar' | 'topbar'

/** Real accounts get an account menu; the offline demo gets a role switcher. */
export function RoleSwitcher({ placement }: { placement: Placement }) {
  return isApiMode ? <AccountMenu placement={placement} /> : <DemoRoleSwitcher placement={placement} />
}

/** Who is signed in (and where), the studio page for coaches who run one or could, and sign-out. */
function AccountMenu({ placement }: { placement: Placement }) {
  const { data } = useData()
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const role = session?.role
  const asCoach = isCoachRole(role)
  const student = data.students.find((s) => s.id === session?.studentId)
  const name = (asCoach ? data.coach.name : student?.name) || session?.name || ''
  const id = asCoach ? data.coach.id : (student?.id ?? 'x')
  const email = asCoach ? data.coach.email : student?.email
  const inStudio = selectIsStudio(data)
  const where = asCoach && inStudio ? data.studio?.name : undefined
  const label = role ? ROLE_LABEL[role] : ''
  // Pila More More is for studios only: the owner manages it; teachers and students just use it.
  const studioLink = role === 'owner' ? '工作室管理' : null
  const notify = useToast()
  const [notifications, setNotifications] = useState(false)
  // The service owner gets a way into the admin page.
  const [admin, setAdmin] = useState(false)
  const token = session?.token
  useEffect(() => {
    if (!token) return
    let live = true
    adminStatus(token)
      .then((r) => live && setAdmin(r.admin))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [token])
  const openNotifications = () => {
    setOpen(false)
    setNotifications(true)
  }
  const logOut = () => {
    signOut()
    navigate('/login')
  }
  const goStudio = () => {
    setOpen(false)
    navigate('/coach/studio')
  }
  // Owners (the same people who get the studio link).
  const goRevenue = () => {
    setOpen(false)
    navigate('/coach/revenue')
  }
  const goBilling = () => {
    setOpen(false)
    navigate(BILLING_PATH)
  }

  // Desktop: a card in the sidebar; phones: a chip in the top bar. Both open the same account menu.
  const trigger =
    placement === 'sidebar' ? (
      <div className="rounded-xl bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} id={id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{[label, where].filter(Boolean).join('・')}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={Settings} className="mt-2 w-full" onClick={() => setOpen(true)}>
          帳號與設定
        </Button>
        <Button variant="secondary" size="sm" icon={LogOut} className="mt-2 w-full" onClick={logOut}>
          登出
        </Button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-full bg-fill py-1 pr-3 pl-1 text-[13px] font-medium text-ink-800"
        aria-label="帳號"
      >
        <Avatar name={name} id={id} size="sm" />
        <span className="max-w-24 truncate">{name}</span>
      </button>
    )

  return (
    <>
      {trigger}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        description={[label, where, email].filter(Boolean).join('・')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} className="h-11 md:h-10">
              取消
            </Button>
            <Button icon={LogOut} onClick={logOut} className="h-11 md:h-10">
              登出
            </Button>
          </>
        }
      >
        <AppearancePicker />
        <div className="my-4 border-t border-line" />
        <div className="space-y-2">
          {admin && (
            <Button
              variant="secondary"
              icon={LayoutDashboard}
              className="h-11 w-full"
              onClick={() => {
                setOpen(false)
                navigate('/admin')
              }}
            >
              後台管理
            </Button>
          )}
          {admin && (
            // Showing the product at a gym: the studio demo, full of data, then straight back here.
            <Button
              variant="secondary"
              icon={Presentation}
              className="h-11 w-full"
              onClick={() => {
                if (!enterLocalDemo(demoSession('owner'), demoHome('owner'), { keepAccount: true })) notify('此瀏覽器無法儲存示範資料', 'error')
              }}
            >
              示範模式（給客戶看）
            </Button>
          )}
          <Button variant="secondary" icon={Bell} className="h-11 w-full" onClick={openNotifications}>
            通知設定
          </Button>
          {studioLink && (
            <Button variant="secondary" icon={ReceiptText} className="h-11 w-full" onClick={goRevenue}>
              業績報表
            </Button>
          )}
          {studioLink && (
            <Button variant="secondary" icon={Building2} className="h-11 w-full" onClick={goStudio}>
              {studioLink}
            </Button>
          )}
          {data.billing && (
            <Button variant="secondary" icon={CreditCard} className="h-11 w-full" onClick={goBilling}>
              方案與付款
            </Button>
          )}
        </div>
      </Modal>
      <NotificationSettings open={notifications} onClose={() => setNotifications(false)} />
    </>
  )
}

/** Offline demo: switch between the three demo identities (each switch reloads); reset or leave. */
function DemoRoleSwitcher({ placement }: { placement: Placement }) {
  const { data, actions } = useData()
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const notify = useToast()
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const persona = demoPersonaOf(session)
  const student = data.students.find((s) => s.id === session?.studentId)
  const isCoach = isCoachRole(session?.role)
  const displayName = isCoach ? data.coach.name : (student?.name ?? '學員')
  const displayId = isCoach ? data.coach.id : (student?.id ?? 'x')

  // Phones have no sidebar: the pages it alone links to are here, as in a real account's menu.
  const runsWorkspace = persona === 'owner'
  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const pick = (p: DemoPersona) => {
    if (p === persona) return setOpen(false)
    if (!enterLocalDemo(demoSession(p), demoHome(p))) notify('此瀏覽器無法儲存示範資料', 'error')
  }

  const reset = () => {
    actions.resetDemo()
    setConfirmReset(false)
    setOpen(false)
    navigate(demoHome(persona))
    notify('示範資料已重設')
  }

  return (
    <>
      {placement === 'sidebar' ? (
        <div className="rounded-xl bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2.5">
            <Avatar name={displayName} id={displayId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{displayName}</p>
              <p className="truncate text-xs text-ink-500">{demoPersonaTitle(persona)}・示範模式</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={ArrowLeftRight} className="mt-3 w-full" onClick={() => setOpen(true)}>
            切換示範身分
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-2 rounded-full bg-fill py-1 pr-3 pl-1 text-[13px] font-medium text-ink-800"
          aria-label="切換示範身分"
        >
          <Avatar name={displayName} id={displayId} size="sm" />
          <span className="max-w-24 truncate">{displayName}</span>
          <ArrowLeftRight className="size-3.5 text-ink-400" />
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="示範身分切換" description="此為示範版本，無需登入。經營者、老師與學員看到的是同一間工作室的資料。">
        {runsWorkspace && (
          <div className="mb-5 space-y-2 md:hidden">
            <Button variant="secondary" icon={ReceiptText} className="h-11 w-full" onClick={() => go('/coach/revenue')}>
              業績報表
            </Button>
            {persona === 'owner' && (
              <Button variant="secondary" icon={Building2} className="h-11 w-full" onClick={() => go('/coach/studio')}>
                工作室管理
              </Button>
            )}
          </div>
        )}
        <DemoPersonaList current={persona} onPick={pick} />
        <div className="mt-5 border-t border-line pt-4">
          <AppearancePicker />
        </div>
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            重設這份示範資料
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={LogOut}
            onClick={() => {
              if (isLocalDemo) return exitLocalDemo()
              signOut()
              navigate('/login')
            }}
          >
            {isLocalDemo ? (hasParkedAccount() ? '回到我的帳號' : '離開示範') : '回到登入頁'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="重設示範資料？"
        description="這份示範資料中新增的學員、課程、上課紀錄與堂數異動都會被清除，並重新產生。"
        confirmLabel="重設"
        tone="danger"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  )
}
