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
   * The page's actions: beside the title from `md` up; on phones the main
   * one (`primary`) beside the title as an icon, the others in the header
   * (see `PageAction`). Actions tied to one section (the month
   * navigator, a card, a sticky bottom bar) stay in that section.
   */
  actions?: readonly PageAction[]
  /**
   * The page a sub-page goes back to (an account → « Épargne »): in the
   * header on every width (`PageBack`).
   */
  back?: PageBackLink
}

/**
 * Title block shared by every page of the authenticated app. On phones the
 * title stays on one line (`text-xl` fits « Prévision fin de mois » at
 * 320px: keep new titles that short), the description goes below in a
 * smaller size, the page's main action (`primary`, « + ») stays beside the
 * title as an icon button (the owner's choice on #386) and its other
 * actions move to the header, so the title block never takes a third of
 * the screen. From `md` up every action is a button beside the title.
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
  const main = actions.find((action) => action.primary)
  const others = actions.filter((action) => action !== main)
  // Phones: the main action beside the title as an icon, the others in the
  // header. They need JavaScript anyway, so the server renders them as the
  // buttons of wide screens (hidden below md), rearranged once hydrated.
  const inHeader = isMobile && slot !== null

  return (
    <header>
      {back && <PageBack {...back} />}
      <div className="flex items-start justify-between gap-x-3 gap-y-3 md:flex-wrap md:gap-x-6">
        <div className="min-w-0 flex-1 space-y-1 md:min-w-[min(100%,14rem)]">
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
        {inHeader && main && (
          <Button
            type="button"
            variant="primary"
            iconOnly
            className="shrink-0"
            aria-label={main.label}
            title={main.label}
            loading={main.loading}
            disabled={main.disabled}
            onClick={main.onSelect}
          >
            {main.icon}
          </Button>
        )}
        {inHeader
          ? others.length > 0 &&
            createPortal(<HeaderActions actions={others} />, slot)
          : actions.length > 0 && (
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
            )}
      </div>
    </header>
  )
}

/**
 * The page's other actions in the phone header: one is an icon button named
 * by its label, several go into a « Plus d’actions » menu.
 */
function HeaderActions({ actions }: { actions: readonly PageAction[] }) {
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
