import { cn } from '@finances/ui/lib/utils'
import { ToggleGroup } from 'radix-ui'
import type { ThemeMode } from '#/lib/use-theme'
import { useThemePreference } from '#/lib/use-theme-preference'

const THEMES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'auto', label: 'Système' },
]

function isTheme(value: string): value is ThemeMode {
  return THEMES.some((theme) => theme.value === value)
}

/**
 * The theme as three segments filling their row (#300), applied at once and
 * saved on the account. A rounded track with the chosen one raised, like the
 * shared segmented control of #289 (to use instead once it is in
 * `@finances/ui`): Radix `ToggleGroup type="single"`, radio semantics, never
 * empty, 44px high.
 */
export function ThemeChoice({ labelledBy }: { labelledBy: string }) {
  const { mode, setPreference } = useThemePreference()

  return (
    <ToggleGroup.Root
      type="single"
      role="radiogroup"
      aria-labelledby={labelledBy}
      value={mode}
      onValueChange={(value) => {
        // Pressing the chosen segment again keeps it (never empty).
        if (isTheme(value) && value !== mode) void setPreference(value)
      }}
      className="bg-muted flex w-full gap-0.5 rounded-full p-[3px] dark:bg-black/25"
    >
      {THEMES.map(({ value, label }) => (
        <ToggleGroup.Item
          key={value}
          value={value}
          className={cn(
            'text-muted-foreground inline-flex min-h-[calc(2rem-6px)] flex-1 basis-0 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap',
            'pointer-coarse:touch-hitbox relative',
            'hover:text-foreground focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
            'transition-[color,background-color,box-shadow]',
            'data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-foreground/15',
          )}
        >
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
