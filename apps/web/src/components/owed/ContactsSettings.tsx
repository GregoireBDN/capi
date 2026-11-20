import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  ItemList,
  ItemListGroup,
  ItemListRow,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ContactDto } from '#/api/types.gen'
import {
  FORM_SHEET_BOTTOM,
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetFooter,
} from '#/components/sheets/form-sheet'
import { formatCents } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'
import {
  afterOwedChanged,
  contactsQuery,
  createContact,
  owedErrorMessage,
  removeContact,
  updateContact,
} from './queries'

/**
 * Réglages › Contacts (#359): the people money is shared with, created on
 * the fly where a share is entered. Each opens an editor: the name, the
 * words of their bank labels (to suggest their repayments), the usual day
 * their repayments arrive, archive; « Supprimer » only for one never used.
 */
export function ContactsSettings() {
  const contacts = useQuery(contactsQuery(true))
  const [editing, setEditing] = useState<ContactDto | 'new' | null>(null)
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction({
    label: 'Ajouter un contact',
    icon: <PlusIcon />,
    primary: true,
    onSelect: () => setEditing('new'),
  })

  if (contacts.isPending) return <Skeleton className="h-40 w-full rounded-xl" />
  const list = contacts.data ?? []
  const active = list.filter((c) => !c.archivedAt)
  const archived = list.filter((c) => c.archivedAt)
  return (
    <div className="space-y-4">
      {list.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Aucun contact"
          description="Ils s’ajoutent d’eux-mêmes quand vous partagez une dépense ou notez « Payé pour moi »."
        />
      ) : (
        <Card size="sm">
          <CardContent>
            <ItemList>
              <ItemListGroup>
                {active.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    onOpen={setEditing}
                  />
                ))}
              </ItemListGroup>
              {archived.length > 0 && (
                <ItemListGroup title="Archivés">
                  {archived.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      onOpen={setEditing}
                    />
                  ))}
                </ItemListGroup>
              )}
            </ItemList>
          </CardContent>
        </Card>
      )}
      {!inMenu && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setEditing('new')}
        >
          Ajouter un contact
        </Button>
      )}
      <ContactEditor editing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function ContactRow({
  contact,
  onOpen,
}: {
  contact: ContactDto
  onOpen: (contact: ContactDto) => void
}) {
  const owed = [
    contact.owedToMeCents > 0
      ? `vous doit ${formatCents(contact.owedToMeCents)}`
      : null,
    contact.iOweCents > 0
      ? `vous lui devez ${formatCents(contact.iOweCents)}`
      : null,
  ].filter(Boolean)
  return (
    <ItemListRow
      asChild
      icon={<ContactAvatar name={contact.name} />}
      iconClassName="bg-transparent"
      title={contact.name}
      subtitle={
        owed.join(' · ') ||
        (contact.matchLabels.length > 0
          ? `Libellés : ${contact.matchLabels.join(', ')}`
          : 'Tout réglé')
      }
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(contact)}
      />
    </ItemListRow>
  )
}

function ContactEditor({
  editing,
  onClose,
}: {
  editing: ContactDto | 'new' | null
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? FORM_SHEET_BOTTOM : FORM_SHEET_SIDE}
      >
        <SheetHeader>
          <SheetTitle>
            {editing === 'new' ? 'Nouveau contact' : 'Modifier le contact'}
          </SheetTitle>
          <SheetDescription>
            Aucun compte : un nom, et de quoi reconnaître ses virements.
          </SheetDescription>
        </SheetHeader>
        {editing !== null && (
          <ContactForm
            key={editing === 'new' ? 'new' : editing.id}
            contact={editing === 'new' ? null : editing}
            onDone={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function ContactForm({
  contact,
  onDone,
}: {
  contact: ContactDto | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(contact?.name ?? '')
  const [labels, setLabels] = useState(contact?.matchLabels.join(', ') ?? '')
  const [day, setDay] = useState(
    contact?.repaymentDay ? String(contact.repaymentDay) : '',
  )
  const dayNumber = day.trim() === '' ? null : Number(day)
  const dayValid =
    dayNumber === null ||
    (Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31)
  const ok = name.trim() !== '' && dayValid
  const body = {
    name: name.trim(),
    matchLabels: labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean),
    repaymentDay: dayNumber,
  }
  const done = async (text: string) => {
    onDone()
    await afterOwedChanged(queryClient)
    toast.success(text)
  }
  const save = useMutation({
    mutationFn: () =>
      contact ? updateContact(contact.id, body) : createContact(body),
    onSuccess: () => done(contact ? 'Contact modifié' : 'Contact ajouté'),
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const archive = useMutation({
    mutationFn: () =>
      updateContact(contact!.id, { archived: !contact!.archivedAt }),
    onSuccess: () =>
      done(contact!.archivedAt ? 'Contact rétabli' : 'Contact archivé'),
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => removeContact(contact!.id),
    onSuccess: () => done('Contact supprimé'),
    onError: (error) => toast.error(owedErrorMessage(error)),
  })
  return (
    <form
      className={FORM_SHEET_FORM}
      onSubmit={(event) => {
        event.preventDefault()
        if (ok) save.mutate()
      }}
    >
      <FormSheetBody>
        <Field>
          <FieldLabel htmlFor="contact-name">Nom</FieldLabel>
          <Input
            id="contact-name"
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-labels">
            Mots de ses virements
          </FieldLabel>
          <Input
            id="contact-labels"
            autoComplete="off"
            placeholder="Par ex. « CAMILLE MARTIN »"
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
          />
          <FieldDescription>
            Séparés par des virgules : un virement dont le libellé les contient
            est proposé comme son remboursement.
          </FieldDescription>
        </Field>
        <Field data-invalid={!dayValid}>
          <FieldLabel htmlFor="contact-day">Jour habituel</FieldLabel>
          <Input
            id="contact-day"
            inputMode="numeric"
            placeholder="Fin du mois"
            value={day}
            aria-invalid={!dayValid}
            onChange={(event) =>
              setDay(event.target.value.replace(/\D/g, '').slice(0, 2))
            }
          />
          <FieldDescription>
            Le jour où ses remboursements arrivent d’habitude (prévision).
          </FieldDescription>
        </Field>
        {contact && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              loading={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {contact.archivedAt ? 'Rétablir' : 'Archiver'}
            </Button>
            <Button
              type="button"
              ghost
              variant="danger"
              className="w-full"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Supprimer
            </Button>
            <p className="text-muted-foreground text-xs">
              Un contact qui a un historique s’archive : il sort des listes et
              son historique reste.
            </p>
          </div>
        )}
      </FormSheetBody>
      <FormSheetFooter>
        <Button
          type="submit"
          className="w-full"
          disabled={!ok}
          loading={save.isPending}
        >
          {contact ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </FormSheetFooter>
    </form>
  )
}
