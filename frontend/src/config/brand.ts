// Single place to rename the product.
export const BRAND = {
  name: 'Pila More More',
  /** Headline lines, shown without punctuation. */
  tagline: ['更輕鬆的經營', '更專注的教學'],
  storagePrefix: 'pilamoremore',
  domain: 'pilamoremore.com',
} as const

/**
 * Who runs the service, shown on the public pages, the privacy policy and the terms (as NewebPay's
 * merchant review and Taiwan's 個資法 / 消保法 expect). The operator's name must match the NewebPay
 * merchant account.
 */
export const OPERATOR = {
  name: '林孟玄',
  email: 'alvin4883889@gmail.com',
  /** Date the current privacy policy and terms take effect. */
  policyDate: '2026 年 10 月 31 日',
} as const
