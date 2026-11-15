import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, googleRedirectUri, loadGoogle, prefersGoogleRedirect } from '../../lib/google'
import { useThemePref } from '../../lib/theme'

/** Google's own wording for the two buttons, shown on the stand-in until the real one is drawn. */
const LABEL = { continue_with: '透過 Google 帳戶繼續操作', signup_with: '使用 Google 帳戶註冊' }

/** How long to wait for Google's button to finish drawing before showing it anyway. */
const SHOW_AFTER_MS = 4000

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4.5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * The latest callback is used, so the parent can pass an inline function. Google's script and
 * button can take a while on a slow connection, so a look-alike holds the place until it is drawn:
 * the page doesn't jump, and nothing pops in under the user's finger.
 */
export function GoogleButton({ onCredential, text = 'continue_with' }: { onCredential: (credential: string) => void; text?: 'continue_with' | 'signup_with' }) {
  const ref = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const [error, setError] = useState<string | null>(null)
  // Redrawn when the appearance changes: Google draws a dark button for dark pages.
  const themePref = useThemePref()
  // Which drawing of the button has finished loading (a redraw starts hidden again).
  const drawing = `${text}|${themePref}`
  const [drawn, setDrawn] = useState<string | null>(null)
  const ready = drawn === drawing
  const dark = document.documentElement.dataset.theme === 'dark'

  useEffect(() => {
    callback.current = onCredential
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    loadGoogle()
      .then((google) => {
        if (cancelled || !ref.current) return
        google.accounts.id.initialize(
          prefersGoogleRedirect()
            ? // The page goes to Google and comes back with the token (see takeGoogleRedirect).
              { client_id: GOOGLE_CLIENT_ID!, ux_mode: 'redirect', login_uri: googleRedirectUri() }
            : { client_id: GOOGLE_CLIENT_ID!, callback: (r) => callback.current(r.credential), ux_mode: 'popup' },
        )
        google.accounts.id.renderButton(ref.current, {
          theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text,
          locale: 'zh-TW',
          width: Math.min(400, ref.current.clientWidth || 320),
        })
        // The button is an iframe that loads on its own; swap once it has.
        const show = () => !cancelled && setDrawn(`${text}|${themePref}`)
        const frame = ref.current.querySelector('iframe')
        if (frame) frame.addEventListener('load', show, { once: true })
        else show()
        timer = setTimeout(show, SHOW_AFTER_MS)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, themePref])

  if (!GOOGLE_CLIENT_ID) return null
  return (
    <div>
      <div className="relative flex min-h-11 w-full justify-center">
        <div ref={ref} className={`flex w-full justify-center transition-opacity duration-200 ${ready ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
        {!ready && !error && (
          <div
            aria-hidden
            className={`absolute top-0 flex h-10 w-full max-w-100 items-center justify-center rounded-full border px-10 text-sm font-medium ${
              dark ? 'border-transparent bg-[#131314] text-[#e3e3e3]' : 'border-[#dadce0] bg-white text-[#3c4043]'
            }`}
          >
            <span className="absolute left-3 flex">
              <GoogleMark />
            </span>
            <span className="truncate">{LABEL[text]}</span>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  )
}
