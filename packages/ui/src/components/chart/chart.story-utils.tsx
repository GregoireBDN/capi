/**
 * Helpers shared by the chart stories (frame, globals, play-test steps).
 * Not exported from the package.
 */

import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { cn } from '../../lib/utils'

/** Story globals: dark theme. */
export const DARK = { theme: 'dark' } as const
/** Story globals: 375 px mobile viewport. */
export const MOBILE = {
  viewport: { value: 'mobile', isRotated: false },
} as const

/** A card-like surface, as charts appear in the app. */
export function ChartFrame({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'w-[min(calc(100vw-2rem),42rem)] rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10',
        className,
      )}
    >
      {title ? <p className="text-base font-medium">{title}</p> : null}
      {description ? (
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  )
}

/** Finds the chart graphic (`<svg role="img">`) by its accessible name. */
export async function findChartGraphic(
  canvasElement: HTMLElement,
  name: RegExp,
): Promise<HTMLElement> {
  const graphic = await within(canvasElement).findByRole('img', { name })
  await waitFor(() => expect(graphic.tagName.toLowerCase()).toBe('svg'))
  return graphic
}

/**
 * Focuses the chart and moves the tooltip with the keyboard, then checks the
 * tooltip shows `expected` (a formatted value).
 */
export async function expectKeyboardTooltip(
  canvasElement: HTMLElement,
  graphic: HTMLElement,
  expected: string[],
): Promise<void> {
  graphic.focus()
  await userEvent.keyboard('{ArrowRight}')
  await waitFor(() => {
    const tooltip = canvasElement.querySelector('[data-slot="chart-tooltip"]')
    expect(tooltip).not.toBeNull()
    for (const text of expected) {
      expect(tooltip?.textContent).toContain(text)
    }
  })
}

/** React warnings captured while a story renders (see `captureReactWarnings`). */
const reactWarnings: string[] = []

/**
 * Story `beforeEach`: records `console.error` calls during the render so a
 * play step can assert that React logged no duplicate-key warning.
 */
export function captureReactWarnings(): () => void {
  reactWarnings.length = 0
  const original = console.error
  console.error = (...args: unknown[]) => {
    reactWarnings.push(args.map(String).join(' '))
    original(...args)
  }
  return () => {
    console.error = original
  }
}

/** Fails if React warned about two children with the same key. */
export async function expectNoDuplicateKeys(): Promise<void> {
  await expect(
    reactWarnings.filter((warning) => /same key/i.test(warning)),
  ).toEqual([])
}
