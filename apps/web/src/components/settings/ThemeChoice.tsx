import { SegmentedControl, SegmentedControlItem } from '@capi/ui'
import type { ThemeMode } from '#/lib/use-theme'
import { useThemePreference } from '#/lib/use-theme-preference'

const THEMES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'auto', label: 'Système' },
]

/**
 * The theme as three segments filling their row (#300, the shared
 * `SegmentedControl` of #289): applied at once and saved on the account.
 */
export function ThemeChoice({ labelledBy }: { labelledBy: string }) {
  const { mode, setPreference } = useThemePreference()

  return (
    <SegmentedControl
      fullWidth
      aria-labelledby={labelledBy}
      value={mode}
      onValueChange={(value) => void setPreference(value)}
    >
      {THEMES.map(({ value, label }) => (
        <SegmentedControlItem key={value} value={value}>
          {label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
