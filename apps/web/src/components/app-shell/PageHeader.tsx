import { createPortal } from 'react-dom'
import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from '@finances/ui'
import { EllipsisVerticalIcon } from 'lucide-react'
import { CountPill, IconDot } from './badges'
import { PageBack } from './PageBack'
import type { PageBackLink } from './PageBack'
import {
  useInShell,
  usePageActionsSlot,
  useRegisteredPageActions,
} from './page-actions'
import type { PageAction } from './page-actions'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Shown right after the title (e.g. an « Archivé » badge). */
  titleAddon?: ReactNode
  /**
   * The page's actions: the header's « ⋮ » menu (see `PageAction`). Actions tied to one section (the month
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
 * 320px: keep new titles that short) and the description goes below in a
 * smaller size. The page's actions are the header's « ⋮ » menu on every
 * width (the owner's choice on #386, after trying them as icons and beside
 * the title): the same header everywhere, nothing beside the title. Outside
 * the shell (no header) they stay as buttons beside the title.
 */
export function PageHeader({
  title,
  description,
  titleAddon,
  actions = [],
  back,
}: PageHeaderProps) {
  const inShell = useInShell()
  const slot = usePageActionsSlot()
  // The page's own actions, then the « add » of its sections.
  const registered = useRegisteredPageActions()
  const menu = [...actions, ...registered].filter(
    (action, index, all) =>
      all.findIndex((other) => other.label === action.label) === index,
  )

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
        {inShell
          ? // They need JavaScript anyway: the menu appears once the header
            // has mounted.
            slot !== null &&
            menu.length > 0 &&
            createPortal(<PageActionsMenu actions={menu} />, slot)
          : actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
 * The page's actions in the header: « ⋮ » named « Actions de la page »,
 * opening a menu of them, the main one first.
 */
function PageActionsMenu({ actions }: { actions: readonly PageAction[] }) {
  const ordered = [
    ...actions.filter((action) => action.primary),
    ...actions.filter((action) => !action.primary),
  ]
  const busy = actions.some((action) => action.loading)
  // Something waits behind an item (#393): a dot on the « ⋮ », seen
  // without opening the menu (its number is on the item), said to screen
  // readers after the button's name.
  const counted = actions.filter(
    (action) => action.count && action.count.value > 0,
  )
  const waiting = counted.length > 0
  const countId = useId()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          ghost
          iconOnly
          aria-label="Actions de la page"
          aria-describedby={waiting ? countId : undefined}
          title="Actions de la page"
          className="relative [&_svg]:size-[1.1rem]"
        >
          {busy ? <Spinner /> : <EllipsisVerticalIcon />}
          {waiting && (
            <IconDot
              data-testid="page-actions-count"
              labelId={countId}
              label={counted.map((action) => action.count?.label).join(', ')}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* As wide as its labels (not the icon trigger), within the screen. */}
      <DropdownMenuContent
        align="end"
        className="w-max max-w-(--radix-dropdown-menu-content-available-width)"
      >
        {ordered.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled || action.loading}
            onSelect={action.onSelect}
          >
            {action.loading ? <Spinner /> : action.icon}
            {action.label}
            {action.count && action.count.value > 0 && (
              <CountPill
                value={action.count.value}
                label={action.count.label}
                className="ml-auto"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
