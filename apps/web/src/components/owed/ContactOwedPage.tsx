import {
  Button,
  Card,
  CardContent,
  CategoryIcon,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SettingSwitchRow,
  Skeleton,
  cn,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ReceiptTextIcon,
  RepeatIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type {
  ContactDirectionDto,
  ContactDto,
  ContactOwedDto,
  OffsetDto,
  ReceivableDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { FigureTile } from '#/components/dashboard/FigureTile'
import { currentMonth } from '#/lib/calendar'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { DebtArrows, OWED_TONE, shortCents } from './DebtArrows'
import { stateText } from './format'
import type { OwedSide } from './format'
import { OffsetOfferCard } from './OffsetOffer'
import { ExpectedCard } from './OwedPage'
import { PaidForMeSheet } from './PaidForMeSheet'
import {
  afterOwedChanged,
  contactOwedQuery,
  owedErrorMessage,
  undoOffset,
  updateContact,
} from './queries'
import { ReceivableSheet } from './ReceivableSheet'

/**
 * A person's page (#359, owner's « A. Une feuille par dépense »): what they
 * owe now and what the owner owes them (two groups) with the net position
 * once both are open, the offset to propose and « Toujours compenser », the
 * offsets made (#484), the totals since the start, this month's expected
 * repayments, then the open items oldest first, each opening its sheet,
 * and the history.
 */
export function ContactOwedPage({
  contactId,
  side,
}: {
  contactId: string
  side: OwedSide
}) {
  const detail = useQuery(contactOwedQuery(contactId))
  const [open, setOpen] = useState<ReceivableDto | null>(null)
  const [adding, setAdding] = useState(false)
  const back = {
    label: 'Dépenses partagées',
    to: ROUTES.owed,
    search: side === 'owe' ? { side } : {},
  } as const

  if (detail.isPending) {
    return (
      <div className="@container space-y-6">
        <PageHeader title="…" back={back} />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="@container space-y-6">
        <PageHeader title="Contact" back={back} />
        <p className="text-destructive text-sm">
          {owedErrorMessage(detail.error)}
        </p>
      </div>
    )
  }
  const data: ContactOwedDto = detail.data
  const { contact } = data
  // The item open in the sheet, as refreshed after a change.
  const current =
    open &&
    [
      ...data.owedToMe.open,
      ...data.owedToMe.history,
      ...data.iOwe.open,
      ...data.iOwe.history,
    ].find((item) => item.id === open.id)
  const sections = [
    {
      key: 'owed' as const,
      title: 'Il vous doit',
      data: data.owedToMe,
    },
    {
      key: 'owe' as const,
      title: 'Vous lui devez',
      data: data.iOwe,
    },
  ]
  if (side === 'owe') sections.reverse()

  return (
    <div className="@container space-y-6">
      <PageHeader
        title={contact.name}
        back={back}
        actions={[
          {
            label: 'Quelqu’un a payé pour moi',
            icon: <ReceiptTextIcon />,
            onSelect: () => setAdding(true),
          },
        ]}
      />
      <Card size="sm">
        <CardContent className="@container grid grid-cols-1 gap-2 @lg:grid-cols-2">
          <FigureTile
            label={`${contact.name} vous doit`}
            value={formatCents(contact.owedToMeCents)}
            tone={contact.owedToMeCents > 0 ? 'warning' : undefined}
            notes={[totalsNote(data.owedToMe, 'avancés')]}
            notesOnPhone
          />
          <FigureTile
            label={`Vous devez à ${contact.name}`}
            value={formatCents(contact.iOweCents)}
            notes={[totalsNote(data.iOwe, 'payés pour vous')]}
            notesOnPhone
          />
        </CardContent>
      </Card>

      {data.offer && <OffsetOfferCard offer={data.offer} />}
      <OffsetsCard
        contact={contact}
        offsets={data.offsets}
        offered={data.offer != null}
        both={
          data.owedToMe.totals.totalCents > 0 && data.iOwe.totals.totalCents > 0
        }
      />

      {data.expected.length > 0 && (
        <ExpectedCard month={currentMonth()} expected={data.expected} />
      )}

      {sections.map((section) =>
        section.data.open.length + section.data.history.length === 0 ? null : (
          <Card key={section.key} size="sm">
            <DashboardCardHeader title={section.title} />
            <CardContent>
              <ItemList>
                {section.data.open.length > 0 && (
                  <ItemListGroup
                    title="À rembourser"
                    total={formatCents(section.data.totals.openCents)}
                  >
                    {section.data.open.map((item) => (
                      <ItemRow key={item.id} item={item} onOpen={setOpen} />
                    ))}
                  </ItemListGroup>
                )}
                {section.data.history.length > 0 && (
                  <ItemListGroup title="Historique">
                    {section.data.history.map((item) => (
                      <ItemRow key={item.id} item={item} onOpen={setOpen} />
                    ))}
                  </ItemListGroup>
                )}
              </ItemList>
            </CardContent>
          </Card>
        ),
      )}

      {data.sharedItems.length > 0 && (
        <p className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
          <RepeatIcon aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 break-normal">
            Partagé chaque mois :{' '}
            {data.sharedItems
              .map(
                (shared) =>
                  `${shared.name} (${shared.share.bps !== null ? `${shared.share.bps / 100} %` : formatCents(shared.share.amountCents ?? 0)})`,
              )
              .join(', ')}{' '}
            ·{' '}
            <Link to={ROUTES.subscriptions} className="text-primary underline">
              Abonnements
            </Link>
          </span>
        </p>
      )}

      <ReceivableSheet
        item={current ?? null}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      />
      <PaidForMeSheet
        open={adding}
        onOpenChange={setAdding}
        initial={{ person: { contactId: contact.id, name: contact.name } }}
      />
    </div>
  )
}

/**
 * « Toujours compenser » and the offsets made with someone (#484), each with
 * « Annuler » (both sides together). Shown once they were owed both ways.
 */
function OffsetsCard({
  contact,
  offsets,
  both,
  offered,
}: {
  contact: ContactDto
  offsets: OffsetDto[]
  both: boolean
  offered: boolean
}) {
  const queryClient = useQueryClient()
  const always = useMutation({
    mutationFn: (alwaysOffset: boolean) =>
      updateContact(contact.id, { alwaysOffset }),
    onSuccess: async (_, alwaysOffset) => {
      await afterOwedChanged(queryClient)
      toast.success(
        alwaysOffset
          ? `Compensé automatiquement avec ${contact.name}`
          : `Plus de compensation automatique avec ${contact.name}`,
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const undo = useMutation({
    mutationFn: (id: string) => undoOffset(id),
    onSuccess: async () => {
      await afterOwedChanged(queryClient)
      toast.success('Compensation annulée')
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  if (!both && !contact.alwaysOffset && offsets.length === 0) return null
  return (
    <Card size="sm">
      <DashboardCardHeader title="Compensations" />
      <CardContent className="space-y-2">
        {!offered && (
          <div className="pb-1">
            <DebtArrows
              name={contact.name}
              owedToMeCents={contact.owedToMeCents}
              iOweCents={contact.iOweCents}
            />
          </div>
        )}
        <SettingSwitchRow
          icon={ArrowLeftRightIcon}
          label="Toujours compenser"
          checked={always.isPending ? always.variables : contact.alwaysOffset}
          onCheckedChange={(checked) => always.mutate(checked)}
        />

        {offsets.length > 0 && (
          <ul className="divide-y text-sm">
            {offsets.map((offset) => (
              <li key={offset.id} className="flex min-h-11 items-center gap-2">
                <CheckIcon
                  aria-hidden
                  className={cn('size-4 shrink-0', OWED_TONE)}
                />
                <p className="min-w-0 flex-1 break-normal">
                  <span className="tabular-nums">
                    {shortCents(offset.amountCents)} compensés
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {' · '}
                    {formatCalendarDate(offset.offsetOn)}
                    {offset.automatic ? ' · auto' : ''}
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  ghost
                  variant="secondary"
                  iconOnly
                  aria-label="Annuler la compensation"
                  title="Annuler la compensation"
                  iconStart={<RotateCcwIcon />}
                  loading={undo.isPending && undo.variables === offset.id}
                  onClick={() => undo.mutate(offset.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function totalsNote(data: ContactDirectionDto, verb: string): string {
  const { totals } = data
  if (totals.totalCents === 0) return 'Rien jusqu’ici'
  return [
    `${formatCents(totals.totalCents)} ${verb}`,
    `${formatCents(totals.repaidCents)} remboursés`,
    totals.forgivenCents > 0
      ? `${formatCents(totals.forgivenCents)} abandonnés`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function ItemRow({
  item,
  onOpen,
}: {
  item: ReceivableDto
  onOpen: (item: ReceivableDto) => void
}) {
  const open = item.state === 'open'
  return (
    <ItemListRow
      asChild
      compactWhenNarrow
      icon={
        item.category ? (
          <CategoryIcon
            icon={item.category.icon ?? undefined}
            color={item.category.color}
          />
        ) : undefined
      }
      iconClassName="bg-transparent"
      title={item.label}
      subtitle={`${formatCalendarDate(item.bookingDate)}${open ? '' : ` · ${stateText(item)}`}`}
      value={
        <span
          className={cn(item.state === 'forgiven' && 'text-muted-foreground')}
        >
          {formatCents(open ? item.leftCents : item.amountCents)}
        </span>
      }
      detail={
        open && item.repaidCents + item.forgivenCents > 0 ? (
          <span className="text-muted-foreground">
            sur {formatCents(item.amountCents)}
          </span>
        ) : undefined
      }
      compactDetail={
        <span className="text-muted-foreground">
          {open ? formatCalendarDate(item.bookingDate) : stateText(item)}
        </span>
      }
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(item)}
      />
    </ItemListRow>
  )
}
