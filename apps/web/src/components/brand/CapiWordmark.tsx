import { cn } from '@capi/ui'

interface CapiWordmarkProps {
  /** Sets the height (e.g. `h-8`); the width follows the wordmark. */
  className?: string
  /**
   * Keeps the blue images in dark mode too: on staging's yellow bar
   * (`env-banner`, #454) the light ones would vanish.
   */
  onBanner?: boolean
  /**
   * Below `md`, the mark alone (the « C »): staging's header has the
   * « Staging » badge beside it, and the whole wordmark would push the avatar
   * out at 320px.
   */
  markOnPhones?: boolean
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

const MARK: BrandImage = {
  light: '/brand/capi-mark.svg',
  dark: '/brand/capi-mark-clair.svg',
  width: 416,
  height: 416,
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
  markOnPhones = false,
}: CapiWordmarkProps) {
  return (
    <span
      role="img"
      aria-label="Capi"
      className={cn('inline-flex shrink-0', className)}
    >
      {markOnPhones ? (
        <>
          <span className="flex h-full md:hidden">
            <Themed image={MARK} onBanner={onBanner} />
          </span>
          <span className="flex h-full max-md:hidden">
            <Themed image={WORDMARK} onBanner={onBanner} />
          </span>
        </>
      ) : (
        <Themed image={WORDMARK} onBanner={onBanner} />
      )}
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
