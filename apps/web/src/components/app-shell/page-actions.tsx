import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * One action of a page (`PageHeader`'s `actions`): an item of the header's
 * « Actions de la page » menu (« ⋮ »), on every width (#386).
 */
export interface PageAction {
  /** The menu item's text. */
  label: string
  /** A lucide icon element, shown on every screen. */
  icon: ReactNode
  onSelect: () => void
  /** The page's main action: first in the menu. */
  primary?: boolean
  loading?: boolean
  disabled?: boolean
}

type Slot = HTMLElement | null

const PageActionsSlotContext = createContext<{
  slot: Slot
  setSlot: (slot: Slot) => void
  backSlot: Slot
  setBackSlot: (slot: Slot) => void
} | null>(null)

/**
 * Lets `AppHeader` host the way back of the page shown (every width) and its
 * actions (phones): the header registers its slot elements,
 * `PageBack` and `PageHeader` render into them through portals.
 */
export function PageActionsSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Slot>(null)
  const [backSlot, setBackSlot] = useState<Slot>(null)
  return (
    <PageActionsSlotContext.Provider
      value={{ slot, setSlot, backSlot, setBackSlot }}
    >
      {children}
    </PageActionsSlotContext.Provider>
  )
}

/** The header's actions slot, null outside the shell or before it mounts. */
export function usePageActionsSlot(): Slot {
  return useContext(PageActionsSlotContext)?.slot ?? null
}

/** Whether the page is shown inside the authenticated shell (its header). */
export function useInShell(): boolean {
  return useContext(PageActionsSlotContext) !== null
}

/** Ref callback for the element that hosts the page actions. */
export function useSetPageActionsSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setSlot
}

/** The header's back slot (left side), null outside the shell. */
export function usePageBackSlot(): Slot {
  return useContext(PageActionsSlotContext)?.backSlot ?? null
}

/** Ref callback for the element that hosts a page's back button. */
export function useSetPageBackSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setBackSlot
}
