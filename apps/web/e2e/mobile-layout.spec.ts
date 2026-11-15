import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AUDIT_ACCOUNTS, AUDIT_STORAGE } from './mobile-layout.setup'

/**
 * Mobile layout audit (issue #27), run with `playwright.mobile.config.ts`:
 * visits every page at phone sizes, in light and dark, and checks that
 *   - the page never scrolls horizontally,
 *   - every interactive control has a hit area of at least 44×44 px,
 *   - form controls have a computed font size ≥ 16px (no iOS zoom on focus).
 *
 * It needs a running stack with a signed-up owner and data on every page (use
 * a throwaway database, never the real one) and the owner's credentials in
 * MOBILE_AUDIT_EMAIL / MOBILE_AUDIT_PASSWORD. Screenshots and a JSON report
 * per page go to MOBILE_AUDIT_OUT (default `test-results/mobile-layout`).
 */

const EMAIL = process.env['MOBILE_AUDIT_EMAIL'] ?? ''
const PASSWORD = process.env['MOBILE_AUDIT_PASSWORD'] ?? ''
const OUT = process.env['MOBILE_AUDIT_OUT'] ?? 'test-results/mobile-layout'
const MIN_TARGET = 44
const MIN_INPUT_FONT = 16

type Step = (page: Page) => Promise<void>
type Scenario = {
  name: string
  /** Path, or account type for `/accounts/$accountId`. */
  path: string
  account?: string
  signedIn?: boolean
  step?: Step
}

const openNav: Step = async (page) => {
  const trigger = page.getByRole('button', { name: 'Ouvrir le menu' })
  // ≥ md the sidebar is a fixed column: nothing to open.
  if (!(await trigger.isVisible())) return
  await trigger.click()
  await page.getByRole('dialog').waitFor()
}
const clickFirst =
  (name: RegExp, role: 'button' | 'checkbox' = 'button'): Step =>
  async (page) => {
    await page.getByRole(role, { name }).first().click()
  }

const SCENARIOS: Array<Scenario> = [
  { name: 'auth', path: '/auth', signedIn: false },
  {
    name: 'auth-forgot',
    path: '/auth',
    signedIn: false,
    step: clickFirst(/oubli/i),
  },
  { name: 'dashboard', path: '/dashboard' },
  {
    name: 'dashboard-expense-sheet',
    path: '/dashboard',
    step: async (page) => {
      await page
        .getByRole('button', { name: 'Ajouter une dépense', exact: true })
        .click()
      await page.getByRole('dialog').waitFor()
    },
  },
  { name: 'net-worth', path: '/net-worth' },
  { name: 'shell-nav', path: '/dashboard', step: openNav },
  {
    name: 'shell-user-menu',
    path: '/dashboard',
    step: async (page) => {
      if (
        await page.getByRole('button', { name: 'Ouvrir le menu' }).isVisible()
      )
        await openNav(page)
      await page.getByRole('button', { name: 'Menu du compte' }).click()
      await page.getByRole('menu').waitFor()
    },
  },
  { name: 'spending', path: '/spending' },
  { name: 'transactions', path: '/transactions?month=all' },
  {
    name: 'transactions-editor',
    path: '/transactions?month=all',
    step: async (page) => {
      await clickFirst(/^Modifier /)(page)
      await page.getByRole('dialog').waitFor()
    },
  },
  {
    name: 'transactions-add',
    path: '/transactions?month=all',
    step: async (page) => {
      await clickFirst(/^Ajouter une opération$/)(page)
      await page.getByRole('dialog').waitFor()
    },
  },
  {
    name: 'transactions-bulk',
    path: '/transactions?month=all',
    step: clickFirst(/^Sélectionner /, 'checkbox'),
  },
  { name: 'review', path: '/review' },
  {
    name: 'review-bulk',
    path: '/review',
    step: clickFirst(/^Sélectionner /, 'checkbox'),
  },
  { name: 'budget', path: '/budget' },
  {
    name: 'budget-editor',
    path: '/budget',
    step: async (page) => {
      await clickFirst(/^Ajouter$/)(page)
      await page.getByRole('dialog').waitFor()
    },
  },
  { name: 'subscriptions', path: '/subscriptions' },
  { name: 'savings', path: '/savings' },
  {
    name: 'savings-goal-editor',
    path: '/savings',
    step: async (page) => {
      await clickFirst(/^Modifier l’objectif/)(page)
      await page.getByRole('dialog').waitFor()
    },
  },
  { name: 'crypto', path: '/crypto' },
  {
    name: 'crypto-holding-editor',
    path: '/crypto',
    step: async (page) => {
      await clickFirst(/^Ajouter un (avoir|wallet)$/)(page)
      await page.getByRole('dialog').waitFor()
    },
  },
  { name: 'forecast', path: '/forecast' },
  { name: 'import', path: '/import' },
  {
    name: 'import-preview',
    path: '/import',
    step: async (page) => {
      await clickFirst(/^Reprendre$/)(page)
      await page
        .getByRole('button', { name: /Valider|Confirmer l’import/ })
        .waitFor()
    },
  },
  { name: 'accounts', path: '/accounts' },
  { name: 'profile', path: '/profile' },
  ...['checking', 'brokerage', 'life_insurance', 'crypto'].map((type) => ({
    name: `account-${type}`,
    path: '/accounts',
    account: type,
  })),
]

type Issue = { tag: string; text: string; w: number; h: number }

/** Runs in the page: overflow, small hit areas and small form fonts. */
function auditPage(min: { target: number; font: number; width: number }) {
  const doc = document.documentElement
  const describe = (el: Element) =>
    (
      el.getAttribute('aria-label') ??
      ((el as HTMLElement).innerText || el.getAttribute('name') || '')
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 60) ||
    `<${el.getAttribute('data-slot') ?? el.getAttribute('role') ?? ''} ${(el.getAttribute('class') ?? '').slice(0, 50)}>`
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none') return false
    return !el.closest('[aria-hidden="true"],[inert],.tsqd-parent-container')
  }
  // Hit area: probe points half a target away from the centre in the four
  // directions (clamped to the viewport); each must land on the control.
  const hits = (el: Element) => {
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const d = min.target / 2 - 1
    const probes: Array<[number, number]> = [
      [cx - d, cy],
      [cx + d, cy],
      [cx, cy - d],
      [cx, cy + d],
    ]
    return probes.every(([x, y]) => {
      const px = Math.min(Math.max(x, 0), innerWidth - 1)
      const py = Math.min(Math.max(y, 0), innerHeight - 1)
      const at = document.elementFromPoint(px, py)
      if (!at) return false
      if (el === at || el.contains(at)) return true
      // A <label> wrapping or pointing at the control also activates it.
      const label = at.closest('label')
      return !!label && (label.contains(el) || label.htmlFor === el.id)
    })
  }
  const selector = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    'summary',
    '[role=button]',
    '[role=checkbox]',
    '[role=switch]',
    '[role=tab]',
    '[role=radio]',
    '[role=combobox]',
    '[role=menuitem]',
    '[role=option]',
    '[role=slider]',
  ].join(',')
  const smallTargets: Array<Issue> = []
  const smallInputs: Array<Issue> = []
  const scrollY = window.scrollY
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el)) continue
    // Disabled controls are exempt (and ignore pointer events anyway).
    if (el.matches(':disabled,[aria-disabled="true"],[data-disabled]')) continue
    // Native inputs visually replaced by a styled sibling are measured there.
    if (el instanceof HTMLInputElement && getComputedStyle(el).opacity === '0')
      continue
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    // Behind an open popover or dialog: not reachable now, not too small.
    const front = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    )
    if (
      front &&
      !el.contains(front) &&
      front.closest('[data-radix-popper-content-wrapper],[role=dialog]')
    )
      continue
    if (!hits(el))
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        text: describe(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    if (el.matches('input,select,textarea,[contenteditable]')) {
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < min.font)
        smallInputs.push({
          tag: el.tagName.toLowerCase(),
          text: describe(el) || (el as HTMLInputElement).placeholder,
          w: size,
          h: 0,
        })
    }
  }
  // Text wider than its box (e.g. an amount that cannot wrap), unless the box
  // scrolls or truncates with an ellipsis on purpose.
  const overflowingText: Array<Issue> = []
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    if (!(el instanceof HTMLElement) || !visible(el)) continue
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    )
    if (!ownText || el.clientWidth <= 1) continue
    const style = getComputedStyle(el)
    if (style.position === 'absolute' && style.clip !== 'auto') continue // sr-only
    if (['auto', 'scroll'].includes(style.overflowX)) continue
    if (style.textOverflow === 'ellipsis') continue
    if (el.closest('[data-slot=table-container]')) continue
    // Wider than itself, or sticking out of its parent's content box.
    let out = style.display !== 'inline' && el.scrollWidth > el.clientWidth + 1
    // Nearest box that lays it out (skip inline / inline-flex wrappers).
    let parent = el.parentElement
    while (parent && getComputedStyle(parent).display.startsWith('inline'))
      parent = parent.parentElement
    if (!out && parent) {
      const ps = getComputedStyle(parent)
      if (!['auto', 'scroll'].includes(ps.overflowX)) {
        const pr = parent.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        out =
          r.right > pr.right - parseFloat(ps.paddingRight) + 1 ||
          r.left < pr.left + parseFloat(ps.paddingLeft) - 1
      }
    }
    if (!out) continue
    overflowingText.push({
      tag: el.tagName.toLowerCase(),
      text: describe(el),
      w: el.clientWidth,
      h: el.scrollWidth,
    })
  }
  // A sheet or dialog that scrolls sideways inside itself (a field wider
  // than the screen): the page does not, but the finger can pan it (#196).
  // Rows of chips that scroll sideways on purpose are short: left out.
  const dialogOverflow = [
    ...document.querySelectorAll<HTMLElement>('[role=dialog], [role=dialog] *'),
  ]
    .filter((el) => {
      if (!visible(el) || el.clientHeight < 120) return false
      const { overflowX } = getComputedStyle(el)
      return (
        ['auto', 'scroll'].includes(overflowX) &&
        el.scrollWidth > el.clientWidth + 1
      )
    })
    .map((el) => describe(el))
  window.scrollTo(0, scrollY)
  return {
    dialogOverflow,
    overflowingText,
    // Compared with the device width: a mobile browser widens the layout
    // viewport (innerWidth) to fit content that overflows.
    scrollWidth: doc.scrollWidth,
    innerWidth: min.width,
    overflow: doc.scrollWidth > min.width,
    smallTargets,
    smallInputs,
  }
}

test.describe('mobile layout', () => {
  test.skip(
    !EMAIL || !PASSWORD,
    'Set MOBILE_AUDIT_EMAIL / MOBILE_AUDIT_PASSWORD',
  )
  test.use({ actionTimeout: 10_000 })

  for (const scheme of ['light', 'dark'] as const) {
    for (const s of SCENARIOS) {
      test(`${s.name} (${scheme})`, async ({ browser }, info) => {
        // Signed in once by mobile-layout.setup.ts (login is rate limited).
        const context = await browser.newContext({
          ...info.project.use,
          storageState: s.signedIn === false ? undefined : AUDIT_STORAGE,
        })
        const page = await context.newPage()
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: 'reduce',
        })
        let target = s.path
        if (s.account) {
          const accounts = JSON.parse(
            readFileSync(AUDIT_ACCOUNTS, 'utf8'),
          ) as Array<{ id: string; type: string }>
          const account = accounts.find((a) => a.type === s.account)
          test.skip(!account, `No ${s.account} account`)
          target = `/accounts/${account!.id}`
        }
        // The dev server keeps a socket open: no `networkidle`; wait for the
        // loading skeletons (aria-busy) to go away instead.
        await page.goto(target)
        await page
          .waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
          .catch(() => undefined)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(500)
        if (s.step) {
          await s.step(page)
          await page.waitForTimeout(500)
        }
        // The TanStack devtools trigger (dev server only) floats over pages.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll<HTMLElement>('body *'))
            if (
              /\bgo\d{6,}/.test(String(el.className)) &&
              getComputedStyle(el).position === 'fixed'
            )
              el.style.display = 'none'
        })
        const result = await page.evaluate(auditPage, {
          target: MIN_TARGET,
          font: MIN_INPUT_FONT,
          width: info.project.use.viewport?.width ?? 0,
        })
        const dir = path.join(OUT, info.project.name, scheme)
        mkdirSync(dir, { recursive: true })
        await page.screenshot({
          path: path.join(dir, `${s.name}.png`),
          fullPage: !s.step,
        })
        writeFileSync(
          path.join(dir, `${s.name}.json`),
          JSON.stringify(result, null, 2),
        )
        expect.soft(result.overflow, 'horizontal scroll').toBe(false)
        expect
          .soft(result.dialogOverflow, 'dialog scrolling sideways')
          .toEqual([])
        expect
          .soft(result.smallTargets, `targets < ${MIN_TARGET}px`)
          .toEqual([])
        expect
          .soft(result.overflowingText, 'text wider than its box')
          .toEqual([])
        expect
          .soft(result.smallInputs, `inputs < ${MIN_INPUT_FONT}px`)
          .toEqual([])
        await context.close()
      })
    }
  }
})
