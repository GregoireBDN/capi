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

/** sRGB channels (0–255) of any CSS colour, resolved by a canvas. */
function resolveColor(color: string): [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return [r!, g!, b!]
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two CSS colours (any syntax the browser knows). */
export function contrastRatio(foreground: string, background: string): number {
  const [high, low] = [
    luminance(resolveColor(foreground)),
    luminance(resolveColor(background)),
  ].sort((a, b) => b - a)
  return (high! + 0.05) / (low! + 0.05)
}

/** Fails unless the two CSS colours reach `minimum`:1 (default 4.5, normal text). */
export async function expectContrast(
  foreground: string,
  background: string,
  minimum = 4.5,
): Promise<void> {
  await expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
    minimum,
  )
}

/** Whether two boxes overlap (touching edges do not count). */
export function boxesOverlap(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  )
}

/**
 * Checks the index-axis labels: the `expected` ones are drawn (e.g. the
 * first and last months) and no two labels overlap.
 */
export async function expectReadableIndexTicks(
  canvasElement: HTMLElement,
  expected: string[],
): Promise<void> {
  await waitFor(
    () => {
      const labels = [
        ...canvasElement.querySelectorAll<SVGTextElement>(
          '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
      ]
      const texts = labels.map((label) => label.textContent ?? '')
      for (const text of expected) expect(texts).toContain(text)
      const boxes = labels.map((label) => label.getBoundingClientRect())
      for (let i = 1; i < boxes.length; i++) {
        expect(boxesOverlap(boxes[i - 1]!, boxes[i]!)).toBe(false)
      }
    },
    { timeout: 5000 },
  )
}
