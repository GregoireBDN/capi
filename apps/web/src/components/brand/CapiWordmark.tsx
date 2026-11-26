import { cn } from '@capi/ui'

interface CapiWordmarkProps {
  /** Sets the height (e.g. `h-8`); the width follows the wordmark. */
  className?: string
  /**
   * Keeps the blue images in dark mode too: on staging's yellow bar
   * (`env-banner`, #454) the light ones would vanish.
   */
  onBanner?: boolean
}

interface BrandImage {
  light: string
  dark: string
  width: number
  height: number
}

const WORDMARK: BrandImage = {
  light: '/brand/capi-nom.svg',
  dark: '/brand/capi-nom-clair.svg',
  width: 1090,
  height: 513,
}

/**
 * The « Capi » wordmark (#464): the mark followed by « api »
 * (`public/brand/`, cropped to the drawing by `scripts/generate-icons.mjs`:
 * the owner's files keep a wide margin). Blue on light, a lighter blue in dark mode (the blue's
 * darkest stop is ~2:1 on the dark background; every stop of the light one is
 * ≥ 4.9:1). The images follow the app's theme (`dark:` variant, the class or
 * the system), and the span carries the name once.
 */
export function CapiWordmark({
  className,
  onBanner = false,
}: CapiWordmarkProps) {
  return (
    <span
      role="img"
      aria-label="Capi"
      className={cn('inline-flex shrink-0', className)}
    >
      <Themed image={WORDMARK} onBanner={onBanner} />
    </span>
  )
}

/** `image` in blue, and in its light variant in dark mode unless on a banner. */
function Themed({ image, onBanner }: { image: BrandImage; onBanner: boolean }) {
  return (
    <>
      <img
        src={image.light}
        alt=""
        width={image.width}
        height={image.height}
        className={cn('h-full w-auto', !onBanner && 'dark:hidden')}
      />
      {!onBanner && (
        <img
          src={image.dark}
          alt=""
          width={image.width}
          height={image.height}
          className="hidden h-full w-auto dark:block"
        />
      )}
    </>
  )
}
