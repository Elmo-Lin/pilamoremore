import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { activateInvite, forgotPassword, googleSignIn, login, refreshSession, registerStudio, resendVerification, resetPassword, verifyEmail } from '../api/auth'
import { API_URL, ApiError, enterLocalDemo, exitLocalDemo, isApiMode } from '../api/client'
import { GoogleButton } from '../components/auth/GoogleButton'
import { Logo } from '../components/layout/AppShell'
import { DemoPersonaList } from '../components/layout/DemoPersonas'
import { Button } from '../components/ui/Button'
import { Segmented, TextInput } from '../components/ui/Form'
import { DemoNotice } from '../components/ui/Primitives'
import type { DemoSession } from '../types'
import { BRAND } from '../config/brand'
import { demoHome, demoSession, type DemoPersona } from '../data/mock'
import { PLANS, TRIAL_DAYS } from '../lib/billing'
import { GOOGLE_CLIENT_ID, googleProfile, inAppBrowser, takeGoogleRedirect } from '../lib/google'
import { homePath } from '../lib/roles'
import { useSession, useToast } from '../store/contexts'

const PANEL_CLASS = 'rounded-2xl bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.05)] md:p-8'

/**
 * Sign-in, the demo picker and password reset: the logo (back to the home page, which explains the
 * product) above one centred panel, so on a phone the form fits without scrolling.
 */
function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:py-10">
      <Link to="/" aria-label={`${BRAND.name} 首頁`} className="mb-5 rounded-lg p-1">
        <Logo />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

export function LoginPage() {
  const location = useLocation()
  // Without a backend (or inside the browser-only demo) there is nothing to sign in to.
  if (!isApiMode) return <Navigate to="/demo" replace state={location.state} />
  return (
    <AuthLayout>
      <ApiAuthPanel />
    </AuthLayout>
  )
}

/** /demo: try the app with made-up data kept in this browser. Not linked from the sign-in page. */
export function DemoPage() {
  const notify = useToast()
  const location = useLocation()
  const missingStudent = (location.state as { missingStudent?: boolean } | null)?.missingStudent

  // A full page load opens the persona's own demo workspace (studio, free coach or self-tracker).
  const continueAs = (persona: DemoPersona) => {
    if (!enterLocalDemo(demoSession(persona), demoHome(persona))) notify('此瀏覽器無法儲存示範資料，請關閉無痕模式後再試', 'error')
  }

  return (
    <AuthLayout>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] md:p-8">
        <h2 className="text-lg font-semibold text-ink-900">進入示範版本</h2>
        <p className="mt-1 text-sm text-ink-500">不需註冊或登入。你的操作只會儲存在此瀏覽器中，不會影響任何人。</p>
        {missingStudent && (
          <p className="mt-4 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-600">原本示範的學員已被刪除，請重新選擇身分。</p>
        )}
        <div className="mt-6">
          <DemoPersonaList onPick={continueAs} />
        </div>
        <p className="mt-6 text-xs leading-relaxed text-ink-500">進入後可隨時從側邊欄或右上角切換身分，也可以重設示範資料。</p>
        {API_URL && (
          <button type="button" onClick={exitLocalDemo} className="group mt-5 flex w-full items-center gap-3 border-t border-line pt-4 text-left">
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink-900">準備好開始了？</span>
              <span className="mt-0.5 block text-[13px] text-ink-500">登入或註冊正式帳號，老師免費試用 {TRIAL_DAYS} 天。</span>
            </span>
            <ArrowRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-700" />
          </button>
        )}
        <DemoNotice className="mt-4" always />
      </section>
    </AuthLayout>
  )
}

type AuthTab = 'login' | 'register' | 'invite'
/** Pila More More is for studios: the owner signs up; teachers and students join with an invite code. */
type AccountType = 'studio'

const ACCOUNT_HINT = {
  studio: `工作室經營者：自己也能帶學員，含 ${PLANS.team.coaches} 位老師、${PLANS.team.students} 位活躍學員。免費試用 ${TRIAL_DAYS} 天，之後 NT$${PLANS.team.price}/月。工作室的老師請向經營者索取邀請碼。`,
} as const

const REGISTER_LABEL = { studio: '建立工作室' } as const

/** Backend-connected sign-in: Google, email/password, studio sign-up, invite code. */
function ApiAuthPanel() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const notify = useToast()
  const [params] = useSearchParams()
  // The public pages' "free trial" buttons open the sign-up tab.
  const [tab, setTab] = useState<AuthTab>(params.get('tab') === 'register' ? 'register' : 'login')
  const accountType: AccountType = 'studio'
  /** A first-time Google user: their token, kept while they pick an account type. */
  const [googleSignup, setGoogleSignup] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Waiting on the server after Google handed back a token (the Google button itself shows nothing). */
  const [googleBusy, setGoogleBusy] = useState(false)
  const inApp = inAppBrowser()
  /** Back from Google's full-page sign-in (phones): its token, or 'error'. */
  const [googleReturn] = useState(takeGoogleRedirect)
  const [error, setError] = useState<string | null>(googleReturn === 'error' ? 'Google 登入沒有完成，請再試一次' : null)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', studio: '', code: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const run = async (task: () => Promise<DemoSession>) => {
    setBusy(true)
    setError(null)
    try {
      const session = await task()
      signIn(session)
      navigate(homePath(session.role), { replace: true })
      notify(`歡迎，${session.name ?? ''}`, 'info')
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗')
    } finally {
      setBusy(false)
    }
  }

  const withGoogle = async (credential: string) => {
    setBusy(true)
    setGoogleBusy(true)
    setError(null)
    try {
      const session = await googleSignIn(credential)
      signIn(session)
      navigate(homePath(session.role), { replace: true })
      notify(`歡迎，${session.name ?? ''}`, 'info')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'signup_required') setGoogleSignup(credential)
      else setError(e instanceof Error ? e.message : '登入失敗')
    } finally {
      setBusy(false)
      setGoogleBusy(false)
    }
  }

  // Carry on with Google's returned token exactly as if the popup had answered (once, on arrival).
  const googleHandled = useRef(false)
  useEffect(() => {
    if (googleHandled.current || !googleReturn || googleReturn === 'error') return
    googleHandled.current = true
    void withGoogle(googleReturn)
    // withGoogle is recreated every render; this runs on arrival only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finishGoogleSignup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!googleSignup) return
    if (accountType === 'studio' && !form.studio.trim()) return setError('請輸入工作室名稱')
    void run(() => googleSignIn(googleSignup, { accountType, studio: form.studio.trim() }))
  }

  // Sign-up and invite activation set a new password, so ask for it twice.
  const settingPassword = tab !== 'login'
  const [submitted, setSubmitted] = useState(false)
  const mismatch = settingPassword && (form.confirm !== '' || submitted) && form.confirm !== form.password

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (settingPassword && form.confirm !== form.password) return // shown under the confirm field
    if (tab === 'login') void run(() => login(form.email, form.password))
    if (tab === 'register' && accountType === 'studio') {
      if (!form.studio.trim()) return setError('請輸入工作室名稱')
      void run(() => registerStudio({ name: form.name, email: form.email, password: form.password, studio: form.studio }))
    }
    if (tab === 'invite') void run(() => activateInvite(form.code, form.password))
  }

  const panelClass = PANEL_CLASS
  const errorBox = error && (
    <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
      {error}
    </p>
  )

  if (googleSignup) {
    const profile = googleProfile(googleSignup)
    return (
      <section className={panelClass}>
        <h2 className="text-lg font-semibold text-ink-900">完成註冊</h2>
        <p className="mt-1 text-sm text-ink-500">
          以 Google 帳號 {profile.email} 建立{profile.name ? `「${profile.name}」的` : ''}帳號。
        </p>
        <form onSubmit={finishGoogleSignup} noValidate className="mt-5 space-y-3.5">
          <p className="text-xs text-ink-500">{ACCOUNT_HINT[accountType]}</p>
          {accountType === 'studio' && <TextInput label="工作室名稱" required value={form.studio} onChange={set('studio')} />}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? '處理中…' : REGISTER_LABEL[accountType]}
          </Button>
          <SlowHint active={busy} />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setGoogleSignup(null)
              setError(null)
            }}
          >
            返回
          </Button>
        </form>
        {errorBox}
        <AgreementNote register />
      </section>
    )
  }

  return (
    <section className={panelClass}>
      <h2 className="text-lg font-semibold text-ink-900">登入 {BRAND.name}</h2>
      <div className="mt-4 overflow-x-auto">
        <Segmented
          label="登入方式"
          value={tab}
          onChange={(t) => {
            setTab(t)
            setError(null)
            setSubmitted(false)
          }}
          options={[
            { value: 'login', label: '登入' },
            { value: 'register', label: '註冊' },
            { value: 'invite', label: '邀請碼' },
          ]}
        />
      </div>

      {tab !== 'invite' && GOOGLE_CLIENT_ID && (
        <div className="mt-5">
          {inApp ? (
            // Google refuses to sign in inside these apps' browsers.
            <div className="rounded-lg bg-warn-50 px-3 py-2.5 text-sm text-warn-600">
              {inApp === 'line' ? (
                <>
                  LINE 內建瀏覽器無法使用 Google 登入。
                  <a href={externalUrl()} className="ml-1 font-medium underline">
                    改用瀏覽器開啟
                  </a>
                </>
              ) : (
                '這個 App 的內建瀏覽器無法使用 Google 登入，請點右上角選單，選擇「用 Safari 開啟」或「在瀏覽器開啟」。'
              )}
            </div>
          ) : (
            <GoogleButton onCredential={(c) => void withGoogle(c)} text={tab === 'register' ? 'signup_with' : 'continue_with'} />
          )}
          {googleBusy && (
            <div role="status" className="mt-3 flex flex-col items-center gap-1 text-sm text-ink-600">
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent-600" />
                正在用 Google 登入…
              </span>
              <SlowHint active />
            </div>
          )}
          <div className="mt-5 flex items-center gap-3 text-xs text-ink-400">
            <span className="h-px flex-1 bg-line" />
            或使用 Email
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate className="mt-5 space-y-3.5">
        {tab === 'register' && (
          <>
            <p className="text-xs text-ink-500">{ACCOUNT_HINT[accountType]}</p>
            <TextInput label="姓名" value={form.name} onChange={set('name')} autoComplete="name" />
          </>
        )}
        {tab === 'invite' ? (
          <TextInput
            label="邀請碼"
            value={form.code}
            onChange={set('code')}
            placeholder="老師或工作室提供的 8 碼邀請碼"
            autoCapitalize="characters"
            hint={GOOGLE_CLIENT_ID ? '也可以不用邀請碼：在「登入」用受邀的 Email 以 Google 登入。' : undefined}
          />
        ) : (
          <TextInput label="Email" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="email" />
        )}
        <TextInput
          label={tab === 'login' ? '密碼' : '設定密碼'}
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          hint={tab === 'login' ? undefined : '至少 8 個字元'}
        />
        {tab === 'login' && (
          <p className="-mt-1.5 text-right text-[13px]">
            <Link to="/forgot-password" className="text-accent-700 hover:underline">
              忘記密碼？
            </Link>
          </p>
        )}
        {settingPassword && (
          <TextInput
            label="再次輸入密碼"
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            error={mismatch ? (form.confirm ? '兩次輸入的密碼不一致' : '請再次輸入密碼') : undefined}
          />
        )}
        {tab === 'register' && accountType === 'studio' && <TextInput label="工作室名稱" required value={form.studio} onChange={set('studio')} />}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? '處理中…' : tab === 'login' ? '登入' : tab === 'register' ? REGISTER_LABEL[accountType] : '啟用帳號'}
        </Button>
        <SlowHint active={busy && !googleBusy} />
      </form>
      {errorBox}
      <AgreementNote register={tab === 'register'} />
    </section>
  )
}

// ----------------------------------------------------------------------------- forgot / reset password

/** /forgot-password: mail a reset link. The answer never says whether the email is registered. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('請輸入正確的 Email')
    setBusy(true)
    setError(null)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '寄送失敗，請稍後再試')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <section className={PANEL_CLASS}>
        <h2 className="text-lg font-semibold text-ink-900">忘記密碼</h2>
        {sent ? (
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-600">
            <p>
              如果 <strong className="text-ink-900">{email.trim()}</strong> 有註冊，我們已經寄出重設密碼的連結，請在 1 小時內點開。
            </p>
            <p className="text-[13px] text-ink-500">沒收到的話，請看看垃圾郵件匣，或過一分鐘再試一次。用 Google 註冊的帳號，也可以直接用 Google 登入。</p>
            <Button variant="secondary" className="w-full" onClick={() => setSent(false)}>
              重新寄送
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-3.5">
            <p className="text-sm text-ink-600">輸入註冊時的 Email，我們會寄一封重設密碼的信給你。</p>
            <TextInput label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? '寄送中…' : '寄送重設連結'}
            </Button>
          </form>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
            {error}
          </p>
        )}
        <p className="mt-5 text-center text-[13px]">
          <Link to="/login" className="text-accent-700 hover:underline">
            回到登入
          </Link>
        </p>
      </section>
    </AuthLayout>
  )
}

/** /reset-password?token=…: the link from the email. Sets the new password and signs in. */
export function ResetPasswordPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const notify = useToast()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('密碼至少 8 個字元')
    if (password !== confirm) return setError('兩次輸入的密碼不一致')
    setBusy(true)
    setError(null)
    try {
      const session = await resetPassword(token, password)
      signIn(session)
      navigate(homePath(session.role), { replace: true })
      notify('密碼已更新，已為你登入')
    } catch (err) {
      setError(err instanceof Error ? err.message : '重設失敗，請重新申請')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <section className={PANEL_CLASS}>
        <h2 className="text-lg font-semibold text-ink-900">設定新密碼</h2>
        {token ? (
          <form onSubmit={submit} noValidate className="mt-4 space-y-3.5">
            <TextInput label="新密碼" type="password" autoComplete="new-password" hint="至少 8 個字元" value={password} onChange={(e) => setPassword(e.target.value)} />
            <TextInput label="再次輸入新密碼" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? '處理中…' : '更新密碼並登入'}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ink-600">這個連結不完整，請從信中的按鈕重新開啟，或重新申請。</p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
            {error}
          </p>
        )}
        <p className="mt-5 text-center text-[13px]">
          <Link to="/forgot-password" className="text-accent-700 hover:underline">
            重新申請重設連結
          </Link>
        </p>
      </section>
    </AuthLayout>
  )
}

/** The link mailed after signing up: proves the email, then straight into the app. */
export function VerifyEmailPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const notify = useToast()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(token ? null : '這個連結不完整，請從信中的按鈕重新開啟。')
  /** Opened before: by them in another browser, or by their mail app. Nothing is wrong. */
  const [alreadyVerified, setAlreadyVerified] = useState(false)
  const sent = useRef(false)

  useEffect(() => {
    // Once, even when React runs effects twice in development: the link can only be spent once.
    if (!token || sent.current) return
    sent.current = true
    verifyEmail(token).then(
      (session) => {
        signIn(session)
        navigate(homePath(session.role), { replace: true })
        notify('Email 已驗證，歡迎使用')
      },
      (err) => {
        if (err instanceof ApiError && err.code === 'already_verified') setAlreadyVerified(true)
        else setError(err instanceof Error ? err.message : '驗證失敗，請登入後重新寄送')
      },
    )
  }, [token, signIn, navigate, notify])

  return (
    <AuthLayout>
      <section className={PANEL_CLASS}>
        <h2 className="text-lg font-semibold text-ink-900">驗證 Email</h2>
        {alreadyVerified ? (
          <>
            <p className="mt-4 text-sm text-ink-600">你的 Email 已經驗證完成，直接登入就可以開始使用。</p>
            <p className="mt-5 text-center text-[13px]">
              <Link to="/login" className="text-accent-700 hover:underline">
                前往登入
              </Link>
            </p>
          </>
        ) : error ? (
          <>
            <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600" role="alert">
              {error}
            </p>
            <p className="mt-5 text-center text-[13px]">
              <Link to="/login" className="text-accent-700 hover:underline">
                前往登入
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-600">
            <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent-600" />
            正在驗證…
          </p>
        )}
      </section>
    </AuthLayout>
  )
}

/** Wait before another verification email can be asked for (the server's own limit is the same). */
const RESEND_WAIT_S = 60

/** All a new account sees until it opens the mailed link. */
export function VerifyEmailGate() {
  const { session, signIn, signOut } = useSession()
  const notify = useToast()
  const [checking, setChecking] = useState(false)
  const [wait, setWait] = useState(0)
  const token = session?.token

  // Back from the mail app (verified in another browser): carry on without a tap.
  useEffect(() => {
    if (!token) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshSession(token).then(
        (s) => !s.unverifiedEmail && signIn(s),
        () => {},
      )
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [token, signIn])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (!token) return null

  const check = async () => {
    setChecking(true)
    try {
      const s = await refreshSession(token)
      if (s.unverifiedEmail) notify('還沒完成驗證，請到信箱點驗證連結', 'info')
      else {
        signIn(s)
        notify('Email 已驗證，歡迎使用')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '無法確認，請稍後再試', 'error')
    } finally {
      setChecking(false)
    }
  }

  const resend = async () => {
    setWait(RESEND_WAIT_S)
    try {
      await resendVerification(token)
      notify('已重新寄出驗證信')
    } catch (err) {
      setWait(0)
      notify(err instanceof Error ? err.message : '寄送失敗，請稍後再試', 'error')
    }
  }

  return (
    <AuthLayout>
      <section className={PANEL_CLASS}>
        <h2 className="text-lg font-semibold text-ink-900">驗證你的 Email</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          我們寄了一封驗證信到 <span className="font-medium break-all text-ink-900">{session.unverifiedEmail}</span>，點信中的按鈕就能開始使用。
        </p>
        <p className="mt-2 text-sm text-ink-500">沒收到的話，請看看垃圾郵件匣，或重新寄送。連結 24 小時內有效。</p>
        <div className="mt-5 space-y-2">
          <Button size="lg" className="w-full" disabled={checking} onClick={() => void check()}>
            {checking ? '確認中…' : '我已完成驗證'}
          </Button>
          <Button variant="secondary" size="lg" className="w-full" disabled={wait > 0} onClick={() => void resend()}>
            {wait > 0 ? `重新寄送（${wait} 秒後）` : '重新寄送驗證信'}
          </Button>
        </div>
        <p className="mt-5 text-center text-[13px] text-ink-500">
          Email 打錯了？
          <button type="button" onClick={signOut} className="ml-1 text-accent-700 hover:underline">
            登出
          </button>
          後用正確的 Email 重新註冊。
        </p>
      </section>
    </AuthLayout>
  )
}

/** Signing up accepts the terms; the links are also how reviewers and visitors find the policies. */
function AgreementNote({ register }: { register: boolean }) {
  const link = 'text-accent-700 hover:underline'
  return (
    <p className="mt-5 text-center text-xs leading-relaxed text-ink-500">
      {register ? '註冊即表示你同意' : '使用本服務即表示你同意'}
      <Link to="/terms" className={link}>
        服務條款
      </Link>
      與
      <Link to="/privacy" className={link}>
        隱私權政策
      </Link>
      。
      <Link to="/" className={`ml-2 ${link}`}>
        回首頁
      </Link>
    </p>
  )
}

/** After a few seconds of waiting: the server may be starting up (it sleeps when idle). */
function SlowHint({ active }: { active: boolean }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setSlow(true), 4000)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [active])
  if (!active || !slow) return null
  return <p className="text-center text-xs text-ink-500">伺服器啟動中，第一次可能需要 10 幾秒，請稍候</p>
}

/** This page, asking LINE to open it in the phone's own browser. */
function externalUrl() {
  const url = new URL(location.href)
  url.searchParams.set('openExternalBrowser', '1')
  return url.toString()
}
