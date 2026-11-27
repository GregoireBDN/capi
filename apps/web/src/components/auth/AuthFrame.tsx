import type { ReactNode } from 'react'
import { cn } from '@capi/ui'
import { StagingBadge } from '#/components/app-shell/StagingBadge'
import { CapiWordmark } from '#/components/brand/CapiWordmark'
import { useAppEnvironment } from '#/lib/app-environment'

/**
 * The frame of the signed-out pages (#543, the owner's « A · Carte de verre »):
 * a soft blue light behind, the name and one line, then one glass card. Sign
 * in, sign up, forgotten password, reset and email check share it, and it
 * fits one phone screen (320×568) with the keyboard closed.
 */
export function AuthFrame({
  children,
  brand = true,
}: {
  children: ReactNode
  /** False for a step of its own (the passkey offer): no name above. */
  brand?: boolean
}) {
  return (
    <div className="relative isolate flex flex-1 flex-col">
      <AuthBackdrop />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5 px-4 py-6 [@media(max-height:700px)]:gap-3 [@media(max-height:700px)]:py-3">
        {brand && <AuthBrand />}
        {children}
      </main>
    </div>
  )
}

/** Without something behind it, glass reads flat: two blurred lights. */
function AuthBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="bg-primary/25 dark:bg-primary/30 absolute -top-[18%] -left-[30%] size-[75vmax] rounded-full blur-3xl" />
      <div className="absolute -right-[35%] -bottom-[20%] size-[70vmax] rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/15" />
    </div>
  )
}

function AuthBrand() {
  const staging = useAppEnvironment() === 'staging'
  return (
    <header className="flex flex-col items-center gap-1.5 text-center">
      {/* Staging's flask beside the name, as in the header (#504). */}
      <div className="flex items-center gap-2">
        <CapiWordmark className="h-14 [@media(max-height:700px)]:h-10" />
        {staging && <StagingBadge className="size-9 [&_svg]:size-[0.9rem]" />}
      </div>
      <p className="text-muted-foreground text-sm [@media(max-height:700px)]:hidden">
        Vos comptes, d’un coup d’œil.
      </p>
    </header>
  )
}

/** The glass card of a signed-out page, with an optional short title. */
export function AuthPanel({
  title,
  children,
  className,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'glass-panel rounded-sheet w-full space-y-3 p-4',
        className,
      )}
    >
      {title && (
        <h1 className="font-heading text-center text-lg font-semibold tracking-tight text-balance">
          {title}
        </h1>
      )}
      {children}
    </section>
  )
}

/** A quiet link under the card (sign up, back to sign in). */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-center text-sm">{children}</p>
}
