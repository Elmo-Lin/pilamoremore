import { Bell, BellOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deniedHelp, disablePush, enablePush, loadEmailReminders, pushState, saveEmailReminders, type PushState } from '../../lib/push'
import { readJSON, writeJSON } from '../../store/storage'
import { BRAND } from '../../config/brand'
import { useSession, useToast } from '../../store/contexts'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Card } from '../ui/Primitives'

const WHAT = '課程前一天下午 1 點提醒；課程取消或改時間時會立即通知。'

/** Why this device can't (yet) get notifications, and what to do about it. */
const BLOCKED: Partial<Record<PushState, string>> = {
  install: 'iPhone 要先把網站加入主畫面：在 Safari 點「分享」→「加入主畫面」，之後從主畫面的圖示打開，就可以開啟通知。',
  unsupported: '這個瀏覽器不支援通知。',
}

/** This device's push notifications, plus the email fallback for when none of their devices get one. */
export function NotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const token = useSession().session?.token
  const notify = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [email, setEmail] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !token) return
    let live = true
    void pushState().then((s) => live && setState(s))
    loadEmailReminders(token)
      .then((on) => live && setEmail(on))
      .catch(() => live && setEmail(null))
    return () => {
      live = false
    }
  }, [open, token])

  const toggle = async () => {
    if (!token) return
    setBusy(true)
    try {
      if (state === 'on') {
        await disablePush(token)
        setState('off')
        notify('已關閉這台裝置的通知', 'info')
      } else {
        const next = await enablePush(token)
        setState(next)
        if (next === 'on') notify('已開啟課程提醒')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '設定失敗', 'error')
    } finally {
      setBusy(false)
    }
  }

  const setEmailReminders = async (on: boolean) => {
    if (!token) return
    setEmail(on)
    try {
      await saveEmailReminders(token, on)
    } catch (e) {
      setEmail(!on)
      notify(e instanceof Error ? e.message : '設定失敗', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="通知設定" description={WHAT} size="sm">
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-ink-700">這台裝置的推播通知</p>
          {state && (state === 'denied' || BLOCKED[state]) ? (
            <p className="mt-1.5 rounded-lg bg-canvas px-3 py-2.5 text-sm text-ink-600">{state === 'denied' ? deniedHelp() : BLOCKED[state]}</p>
          ) : (
            <Button
              variant={state === 'on' ? 'secondary' : 'primary'}
              icon={state === 'on' ? BellOff : Bell}
              className="mt-2 h-11 w-full"
              disabled={busy || !state}
              onClick={() => void toggle()}
            >
              {busy ? '處理中…' : state === 'on' ? '關閉通知' : '開啟通知'}
            </Button>
          )}
          {state === 'on' && <p className="mt-1.5 text-xs text-ink-500">已開啟。其他手機或電腦要各自開啟。</p>}
        </div>
        {email !== null && (
          <label className="flex items-start gap-2.5 text-sm text-ink-700">
            <input type="checkbox" checked={email} onChange={(e) => void setEmailReminders(e.target.checked)} className="mt-0.5 size-4 accent-accent-600" />
            <span>
              沒收到推播時，改寄 Email 提醒
              <span className="block text-xs text-ink-500">例如沒有開啟通知的時候。</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}

const DISMISSED = `${BRAND.storagePrefix}:reminder-prompt-dismissed`

/** On the home page until notifications are on (or the card is closed): one tap to turn them on. */
export function ReminderPrompt() {
  const token = useSession().session?.token
  const notify = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [hidden, setHidden] = useState(() => readJSON<boolean>(DISMISSED) === true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (hidden) return
    let live = true
    void pushState().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [hidden])

  if (hidden || !token || (state !== 'off' && state !== 'install')) return null
  const dismiss = () => {
    writeJSON(DISMISSED, true)
    setHidden(true)
  }
  const turnOn = async () => {
    setBusy(true)
    try {
      const next = await enablePush(token)
      setState(next)
      if (next === 'on') notify('已開啟課程提醒')
      else if (next === 'denied') notify(deniedHelp(), 'info')
    } catch (e) {
      notify(e instanceof Error ? e.message : '設定失敗', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 flex items-start gap-3 p-4">
      <Bell className="mt-0.5 size-5 shrink-0 text-accent-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">開啟課程提醒</p>
        <p className="mt-0.5 text-[13px] text-ink-500">{state === 'install' ? BLOCKED.install : WHAT}</p>
        {state === 'off' && (
          <Button size="sm" className="mt-2.5" disabled={busy} onClick={() => void turnOn()}>
            {busy ? '處理中…' : '開啟通知'}
          </Button>
        )}
      </div>
      <button type="button" aria-label="關閉" onClick={dismiss} className="-m-1 rounded-md p-1 text-ink-400 hover:text-ink-700">
        <X className="size-4" />
      </button>
    </Card>
  )
}
