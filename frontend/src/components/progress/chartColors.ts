// Series colours come from the theme (index.css): rose, green and purple, lighter in dark mode.
// Validated on #ffffff (light) and #1c181a (dark) cards.
export const SERIES_1 = 'var(--color-series-1)'
export const SERIES_2 = 'var(--color-series-2)'
export const SERIES_3 = 'var(--color-series-3)'

/** Sign-ups by account type: one colour each, in this order everywhere (legend, stack, tooltip). */
export const SIGNUP_SERIES = [
  { key: 'studio', label: '工作室', color: SERIES_1 },
  { key: 'solo', label: '個人老師', color: SERIES_2 },
  { key: 'self', label: '自主練習', color: SERIES_3 },
] as const
