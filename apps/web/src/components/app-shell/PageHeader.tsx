import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  useIsMobile,
} from '@finances/ui'
import { EllipsisVerticalIcon } from 'lucide-react'
import { PageBack } from './PageBack'
import type { PageBackLink } from './PageBack'
import { usePageActionsSlot } from './page-actions'
import type { PageAction } from './page-actions'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Shown right after the title (e.g. an « Archivé » badge). */
  titleAddon?: ReactNode
  /**
   * The page's actions: beside the title from `md` up, in the top bar on
   * phones (see `PageAction`). Actions tied to one section (the month
   * navigator, a card, a sticky bottom bar) stay in that section.
   */
  actions?: readonly PageAction[]
  /**
   * The page a sub-page goes back to (an account → « Épargne »): in the top
   * bar on phones, a chip above the title from `md` up (`PageBack`).
   */
  back?: PageBackLink
}

/**
 * Title block shared by every page of the authenticated app. On phones the
 * title stays on one line (`text-xl` fits « Prévision fin de mois » at
 * 320px: keep new titles that short), the
 * description goes below in a smaller size and the actions move to the top
 * bar, so the header never takes a third of the screen.
 */
export function PageHeader({
  title,
  description,
  titleAddon,
  actions = [],
  back,
}: PageHeaderProps) {
  const isMobile = useIsMobile()
  const slot = usePageActionsSlot()
  // Phones: the actions live in the top bar. They need JavaScript anyway, so
  // the server renders them beside the title (hidden below md) and they move
  // into the top bar once hydrated.
  const inTopBar = isMobile && slot !== null

  return (
    <header>
      {back && <PageBack {...back} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[min(100%,14rem)] flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words md:text-2xl">
              {title}
            </h1>
            {titleAddon}
          </div>
          {description && (
            <p className="text-muted-foreground text-xs md:text-sm">
              {description}
            </p>
          )}
        </div>
        {actions.length > 0 &&
          (inTopBar ? (
            createPortal(<TopBarActions actions={actions} />, slot)
          ) : (
            <div className="flex flex-wrap gap-2 max-md:hidden">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.primary ? 'primary' : 'secondary'}
                  outline={!action.primary}
                  iconStart={action.icon}
                  loading={action.loading}
                  disabled={action.disabled}
                  onClick={action.onSelect}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ))}
      </div>
    </header>
  )
}

/**
 * The page actions in the phone top bar: one action is an icon button named
 * by its label (in the primary colour when it is the page's main action),
 * several go into a « Plus d’actions » menu.
 */
function TopBarActions({ actions }: { actions: readonly PageAction[] }) {
  if (actions.length === 1) {
    const [only] = actions
    return (
      <Button
        type="button"
        variant={only.primary ? 'primary' : 'secondary'}
        ghost
        iconOnly
        aria-label={only.label}
        title={only.label}
        loading={only.loading}
        disabled={only.disabled}
        onClick={only.onSelect}
      >
        {only.icon}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          ghost
          iconOnly
          aria-label="Plus d’actions"
        >
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      {/* As wide as its labels (not the icon trigger), within the screen. */}
      <DropdownMenuContent
        align="end"
        className="w-max max-w-(--radix-dropdown-menu-content-available-width)"
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled || action.loading}
            onSelect={action.onSelect}
          >
            {action.loading ? <Spinner /> : action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
