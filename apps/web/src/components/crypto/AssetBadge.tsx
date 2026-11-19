import { cn } from '@finances/ui/lib/utils'
import { assetColor, isHexColor, textOn } from './asset-colors'

/**
 * The ticker in a round badge, in the coin's own colour (BTC orange, ETH
 * blue…, `asset-colors.ts`), else the colour of its part in the split, else
 * muted. 32px whatever the root size (the app's rem is 22px); left out on
 * the narrowest cards (320px phones), where the name comes first: put it in
 * an `@container`.
 */
export function AssetBadge({
  symbol,
  color,
  size = 'md',
  className,
}: {
  symbol: string
  /** Its part's colour in a split (a coin's own colour, or the palette's). */
  color?: string
  /** `sm`: 24px, always shown (a search result, a recap). */
  size?: 'sm' | 'md'
  className?: string
}) {
  const shown = color ?? assetColor(symbol)
  const text = symbol.slice(0, 4)
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted text-muted-foreground shrink-0 items-center justify-center overflow-hidden rounded-full leading-none font-semibold',
        size === 'md' ? 'hidden size-[32px] @[12rem]:flex' : 'flex size-[24px]',
        // Four letters (USDT, LINK) still fit the disc.
        size === 'md'
          ? text.length > 3
            ? 'text-[9px]'
            : 'text-[10px]'
          : text.length > 3
            ? 'text-[7px]'
            : 'text-[8px]',
        className,
      )}
      style={
        shown === undefined
          ? undefined
          : isHexColor(shown)
            ? { background: shown, color: textOn(shown) }
            : {
                background: `color-mix(in oklab, ${shown} 16%, transparent)`,
                color: shown,
              }
      }
    >
      {text}
    </span>
  )
}
