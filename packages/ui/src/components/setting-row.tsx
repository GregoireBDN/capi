import { ChevronRightIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/utils'
import { Switch } from './switch'

/**
 * A group of settings, iPhone style (#280, the transaction editor): a tinted
 * block without border, square rows and straight full-width hairlines
 * between them.
 */
export const SETTING_GROUP_CLASS =
  'bg-muted/60 divide-border divide-y overflow-hidden rounded-md'

/** A row of a group: square, hover and focus inside its block. */
export const SETTING_ROW_CLASS =
  'hover:bg-muted focus-visible:ring-ring/50 flex min-h-9 w-full items-center gap-3 px-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-inset'

/*
 * The app's body sets `overflow-wrap: anywhere` (no sideways scroll at
 * 320px), which lets a flex item shrink below its longest word and break it
 * (« Catégori / e », #325). The labels below use `break-normal`: they wrap
 * between their words only.
 */

/**
 * A row that opens a screen: icon, label, value and ›. The label keeps its
 * width and the value is cut with « … » first; a label too long for the row
 * (« Corriger montant ou date » at 320px) wraps between its words.
 */
function SettingRow({
  icon: Icon,
  label,
  value,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'value' | 'children'> & {
  icon: LucideIcon
  label: string
  value?: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-slot="setting-row"
      className={cn(SETTING_ROW_CLASS, className)}
      {...props}
    >
      <Icon
        className="text-muted-foreground size-[0.8rem] shrink-0"
        aria-hidden="true"
      />
      {value === undefined ? (
        <span data-slot="setting-label" className="flex-1 py-2 break-normal">
          {label}
        </span>
      ) : (
        <>
          <span
            data-slot="setting-label"
            className="max-w-[70%] shrink-0 py-2 break-normal"
          >
            {label}
          </span>
          <span
            data-slot="setting-value"
            className="text-muted-foreground min-w-0 flex-1 truncate text-right"
          >
            {value}
          </span>
        </>
      )}
      <ChevronRightIcon
        className="text-muted-foreground size-[0.7rem] shrink-0"
        aria-hidden="true"
      />
    </button>
  )
}

/** A row with a switch, saved at once. */
function SettingSwitchRow({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = React.useId()
  return (
    <div
      data-slot="setting-switch-row"
      className="flex min-h-9 items-center gap-3 px-3 text-sm"
    >
      <Icon
        className="text-muted-foreground size-[0.8rem] shrink-0"
        aria-hidden="true"
      />
      <label
        htmlFor={id}
        data-slot="setting-label"
        className="flex-1 cursor-pointer py-2 break-normal"
      >
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export { SettingRow, SettingSwitchRow }
