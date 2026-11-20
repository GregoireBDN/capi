import {
  ConfirmDialog,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  useIsMobile,
} from '@finances/ui'
import { LoaderCircleIcon, LogOutIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { UserDto } from '#/api/types.gen'
import { ThemeChoice } from '#/components/settings/ThemeChoice'
import { useSignOut } from '#/lib/use-sign-out'
import { initials } from './initials'

/** A row of the menu: 44px, its icon in a 20px column. */
const ROW = cn(
  'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm outline-none',
  'hover:bg-muted/70 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  'disabled:opacity-60',
  '[&>svg]:text-muted-foreground [&>svg]:size-[1.1rem] [&>svg]:shrink-0',
)

/**
 * The account menu (#386, the owner's direction « A », after Azure DevOps):
 * the avatar at the end of the header opens a card with who is signed in
 * (name, email), Apparence (`ThemeChoice`, applied at once) and « Se
 * déconnecter ». Réglages is at the sidebar's foot (`AppSidebar`), its one
 * place (the owner, #386). A popover on
 * every width, two taps from any page. On a phone « Se déconnecter ? » comes
 * first, since the row sits under the thumb; on a computer one click.
 */
export function AccountMenu({ user }: { user: UserDto }) {
  const isMobile = useIsMobile()
  const signOut = useSignOut()
  const themeId = useId()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  // The browser may hold the logout response while it clears its cache
  // (`Clear-Site-Data`): the row shows a spinner meanwhile.
  async function runSignOut() {
    setPending(true)
    try {
      await signOut()
    } finally {
      setPending(false)
    }
  }

  function onSignOut() {
    if (isMobile) {
      setOpen(false)
      setConfirming(true)
    } else {
      void runSignOut()
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Compte, ${user.name}`}
            className={cn(
              // A 44px button like the header's « ⋮ »; its disc a little
              // smaller (40px), a solid circle reading bigger than the light
              // tile (the owner, #393).
              'flex size-8 shrink-0 items-center justify-center rounded-full outline-none',
              'hover:opacity-90 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'aria-expanded:ring-ring/50 aria-expanded:ring-[3px]',
            )}
          >
            <Avatar name={user.name} size="sm" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          aria-label="Compte"
          // As wide as a phone allows, with a 0.5rem margin on each side.
          className="w-[min(20rem,calc(100vw-1rem))] gap-0 p-0"
        >
          <div className="flex items-center gap-3 border-b p-4">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold wrap-break-word">{user.name}</p>
              {/* An email breaks after its « @ » only. */}
              <p className="text-muted-foreground text-xs break-normal">
                {emailParts(user.email)}
              </p>
            </div>
          </div>
          <div className="space-y-2 border-b p-3">
            <p id={themeId} className="text-muted-foreground text-xs">
              Apparence
            </p>
            <ThemeChoice labelledBy={themeId} />
          </div>
          <div className="p-1.5">
            <button
              type="button"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={onSignOut}
              className={ROW}
            >
              {pending ? (
                <LoaderCircleIcon aria-hidden className="animate-spin" />
              ) : (
                <LogOutIcon aria-hidden />
              )}
              Se déconnecter
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={runSignOut}
        loading={pending}
        title="Se déconnecter ?"
        description="Vous devrez vous reconnecter pour revoir vos comptes."
        confirmLabel="Se déconnecter"
      />
    </>
  )
}

/** The owner's initials on the primary colour, 40px (in the header's 44px button) or 56px. */
function Avatar({ name, size }: { name: string; size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary text-primary-foreground flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'sm' ? 'size-[40px] text-[15px]' : 'size-[56px] text-[20px]',
      )}
    >
      {initials(name)}
    </span>
  )
}

/** The email with a break opportunity after its « @ ». */
function emailParts(email: string) {
  const at = email.indexOf('@')
  if (at < 0) return email
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  )
}
