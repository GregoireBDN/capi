import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * One action of a page (`PageHeader`'s `actions`): beside the title from `md`
 * up, in the top bar on phones (an icon button, or the « Plus d'actions »
 * menu when the page has several).
 */
export interface PageAction {
  /** Button text, and the icon button's accessible name on phones. */
  label: string
  /** A lucide icon element, shown on every screen. */
  icon: ReactNode
  onSelect: () => void
  /** The page's main action: a filled button beside the title. */
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
 * Lets `AppTopBar` (phones) host the actions of the page shown: the top bar
 * registers its slot element, `PageHeader` renders into it through a portal.
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

/** The top bar's slot element, null outside the authenticated shell. */
export function usePageActionsSlot(): Slot {
  return useContext(PageActionsSlotContext)?.slot ?? null
}

/** Ref callback for the element that hosts the page actions. */
export function useSetPageActionsSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setSlot
}

/** The top bar's back slot (left side, phones), null outside the shell. */
export function usePageBackSlot(): Slot {
  return useContext(PageActionsSlotContext)?.backSlot ?? null
}

/** Ref callback for the element that hosts a page's back button. */
export function useSetPageBackSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setBackSlot
}
