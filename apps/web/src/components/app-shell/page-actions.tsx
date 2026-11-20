import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * One action of a page (`PageHeader`'s `actions`): beside the title from `md`
 * up; on phones in the header, as icon buttons up to two, else the main one
 * and a « Plus d'actions » menu of the others.
 */
export interface PageAction {
  /** Button text, and the icon button's accessible name on phones. */
  label: string
  /** A lucide icon element, shown on every screen. */
  icon: ReactNode
  onSelect: () => void
  /** The page's main action: a filled button, in the primary colour on phones. */
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

/** The header's actions slot, null outside the authenticated shell. */
export function usePageActionsSlot(): Slot {
  return useContext(PageActionsSlotContext)?.slot ?? null
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
