import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  ItemList,
  ItemListGroup,
  ItemListRow,
  Sheet,
  SheetContent,
  useIsMobile,
} from '@capi/ui'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  SheetScroll,
} from '#/components/sheets/form-sheet'

/** One panel of an account that is read now and then (#447). */
export interface AccountDetail {
  id: string
  icon: LucideIcon
  /** The row's name, and the title of its screen. */
  label: string
  /** What it holds in a few words (« 3 · le dernier le 5 nov. »). */
  summary?: ReactNode
  /** Something waits in it (an import to validate, a gap): said in amber. */
  warning?: boolean
  /** Under the screen's title. */
  description?: ReactNode
  /** The screen's body. */
  content: ReactNode
}

/**
 * « Plus d’informations » (#447, the owner's « C. Lignes comme Réglages »):
 * the panels of an account read now and then, as rows at the end of its
 * page (its badge, the name, what it holds in a few words under it, ›; like
 * the wallet's keys, #294), each opening its own
 * screen: the whole screen on a phone, a centred window elsewhere (#385,
 * #394). The page itself keeps what is read every time. Absent items
 * (`false`, `null`) are left out; with none, nothing shows.
 */
export function AccountDetails({
  items,
}: {
  items: (AccountDetail | false | null | undefined)[]
}) {
  const isMobile = useIsMobile()
  // The last row opened stays while its screen closes (no empty frame).
  const [opened, setOpened] = useState<{ id: string; open: boolean } | null>(
    null,
  )
  const shown = items.filter((item): item is AccountDetail => !!item)
  if (shown.length === 0) return null
  const current = shown.find((item) => item.id === opened?.id)

  return (
    <Card role="region" aria-label="Plus d’informations" className="min-w-0">
      <CardHeader>
        <CardTitle>Plus d’informations</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemList>
          <ItemListGroup>
            {shown.map((item) => (
              <ItemListRow
                key={item.id}
                asChild
                icon={<item.icon />}
                iconClassName={
                  item.warning
                    ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                    : undefined
                }
                // A long name (« Relevés de portefeuille ») wraps between
                // its words on a phone rather than being cut.
                title={
                  <span className="break-normal whitespace-normal">
                    {item.label}
                  </span>
                }
                subtitle={
                  item.summary === undefined ? undefined : (
                    <span
                      className={cn(
                        item.warning &&
                          'text-warning-foreground dark:text-warning font-medium',
                      )}
                    >
                      {item.summary}
                    </span>
                  )
                }
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpened({ id: item.id, open: true })}
                />
              </ItemListRow>
            ))}
          </ItemListGroup>
        </ItemList>
      </CardContent>

      <Sheet
        open={opened?.open === true && current !== undefined}
        onOpenChange={(next) =>
          !next && setOpened((was) => was && { ...was, open: false })
        }
      >
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
        >
          {current && (
            <>
              <EditorHeader
                title={current.label}
                description={current.description}
              />
              <SheetScroll className="space-y-4 px-4 pb-6">
                {current.content}
              </SheetScroll>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  )
}
