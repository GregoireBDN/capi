import { createPortal } from 'react-dom'
import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  CountPill,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NotificationDot,
  Spinner,
  cn,
} from '@capi/ui'
import { EllipsisVerticalIcon } from 'lucide-react'
import { PageBack, useDefaultPageBack } from './PageBack'
import type { PageBackLink } from './PageBack'
import {
  useInShell,
  usePageActionsSlot,
  useRegisteredPageActions,
  useSetPageTitleEndSlot,
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
   * The page a sub-page goes back to (an account → « Épargne »): the
   * header's breadcrumb « Épargne › Compte courant », « ‹ Épargne » on
   * phones (`PageBack`, #404). The settings screens get « Réglages » from
   * their layout (`DefaultPageBack`).
   */
  back?: PageBackLink
  /**
   * The breadcrumb's last step when the title is a name of the owner's own
   * (an account: its type, « Comptes › Assurance vie », #404); the title
   * by default.
   */
  crumb?: string
  /**
   * A name of the owner's own, as long as he typed it (an account): `text-xl`
   * on every width, two lines at most, the rest cut with … (#404).
   */
  compactTitle?: boolean
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
  back: ownBack,
  crumb,
  compactTitle = false,
}: PageHeaderProps) {
  const defaultBack = useDefaultPageBack()
  const back = ownBack ?? defaultBack
  const inShell = useInShell()
  const slot = usePageActionsSlot()
  const setTitleEndSlot = useSetPageTitleEndSlot()
  // The page's own actions, then the « add » of its sections.
  const registered = useRegisteredPageActions()
  const menu = [...actions, ...registered].filter(
    (action, index, all) =>
      all.findIndex((other) => other.label === action.label) === index,
  )

  return (
    <header>
      {back && <PageBack {...back} current={crumb ?? title} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[min(100%,14rem)] flex-1 space-y-1">
          {/* 44px high, so what a section puts at its end (#401) moves
              nothing when it arrives. */}
          <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
            <h1
              title={compactTitle ? title : undefined}
              className={cn(
                'min-w-0 text-xl font-semibold tracking-tight break-words',
                compactTitle ? 'line-clamp-2' : 'md:text-2xl',
              )}
            >
              {title}
            </h1>
            {titleAddon}
            {/* The month's status, « Filtres » on phones (`MonthToolbar`,
                `MonthReview`): at the end of the row, below the title when
                both don't fit. */}
            <div
              ref={setTitleEndSlot}
              data-page-title-end
              className="ml-auto flex shrink-0 items-center gap-2 empty:hidden"
            />
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
          // A light filled disc, neither outlined nor tinted like a chosen
          // item, so its dot shows (#393, the owner); round like the
          // avatar and the month's arrows (#434).
          iconOnly
          aria-label="Actions de la page"
          aria-describedby={waiting ? countId : undefined}
          title="Actions de la page"
          className="bg-foreground/10 hover:bg-foreground/15 text-foreground relative rounded-full bg-clip-border [&_svg]:size-[24px]"
        >
          {busy ? <Spinner /> : <EllipsisVerticalIcon />}
          {waiting && (
            <NotificationDot
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
