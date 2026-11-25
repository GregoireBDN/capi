import { cn } from '@capi/ui/lib/utils'
import { CheckIcon } from 'lucide-react'
import { CATEGORY_PALETTE } from './palette'

interface ColorPaletteProps {
  /** Lowercase `#rrggbb`. */
  value: string
  onChange: (color: string) => void
  /** Accessible name of the group, e.g. "Couleur de Courses". */
  label: string
  disabled?: boolean
}

const SWATCH =
  'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/**
 * Colour choice for a category: the chart palette as 44px swatches, plus the
 * system colour picker for any other colour.
 */
export function ColorPalette({
  value,
  onChange,
  label,
  disabled,
}: ColorPaletteProps) {
  const custom = !CATEGORY_PALETTE.some((swatch) => swatch.value === value)
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {CATEGORY_PALETTE.map((swatch) => {
        const selected = swatch.value === value
        return (
          <button
            key={swatch.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={swatch.label}
            disabled={disabled}
            onClick={() => onChange(swatch.value)}
            className={cn(SWATCH, selected && 'ring-foreground ring-2')}
            style={{ backgroundColor: swatch.value }}
          >
            {selected && <CheckIcon className="size-4 text-white" />}
          </button>
        )
      })}
      <label
        className={cn(
          SWATCH,
          'border-border cursor-pointer overflow-hidden border border-dashed focus-within:ring-2 focus-within:ring-ring',
          custom && 'ring-foreground ring-2',
        )}
        style={custom ? { backgroundColor: value } : undefined}
        title="Autre couleur"
      >
        <span className="sr-only">Autre couleur</span>
        {!custom && (
          <span
            aria-hidden="true"
            className="size-5 rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
          />
        )}
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
