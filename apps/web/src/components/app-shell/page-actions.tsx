import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
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
  /**
   * Something waiting behind the action (#393: the transactions to review
   * behind Mouvements' « Voir les opérations »): its number beside the item
   * and on the « ⋮ » itself, so it shows without opening the menu; `label`
   * says it to screen readers (« 7 opérations à revoir »). Hidden at 0.
   */
  count?: { value: number; label: string } | null
}

type Slot = HTMLElement | null

/**
 * An action a section of the page put in the page's menu
 * (`useRegisterPageAction`): its latest icon and handler are read when the
 * menu shows them.
 */
interface RegisteredAction {
  id: string
  label: string
  primary?: boolean
  disabled?: boolean
  loading?: boolean
  count?: PageAction['count']
  icon: () => ReactNode
  onSelect: () => void
}

const PageActionsSlotContext = createContext<{
  slot: Slot
  setSlot: (slot: Slot) => void
  backSlot: Slot
  setBackSlot: (slot: Slot) => void
  monthSlot: Slot
  setMonthSlot: (slot: Slot) => void
  titleEndSlot: Slot
  setTitleEndSlot: (slot: Slot) => void
  registered: readonly RegisteredAction[]
  register: (action: RegisteredAction) => void
  unregister: (id: string) => void
} | null>(null)

/**
 * Lets `AppHeader` host the way back of the page shown and its actions,
 * `MonthBarSlot` its month (`MonthNavigator`, #401) and `PageHeader` the
 * end of the title's row: they register their slot elements, the page's
 * pieces render into them through portals.
 */
export function PageActionsSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Slot>(null)
  const [backSlot, setBackSlot] = useState<Slot>(null)
  const [monthSlot, setMonthSlot] = useState<Slot>(null)
  const [titleEndSlot, setTitleEndSlot] = useState<Slot>(null)
  const [registered, setRegistered] = useState<readonly RegisteredAction[]>([])
  // In place when it is already there, so the menu keeps its order.
  const register = useCallback((action: RegisteredAction) => {
    setRegistered((list) =>
      list.some((item) => item.id === action.id)
        ? list.map((item) => (item.id === action.id ? action : item))
        : [...list, action],
    )
  }, [])
  const unregister = useCallback((id: string) => {
    setRegistered((list) => list.filter((item) => item.id !== id))
  }, [])
  return (
    <PageActionsSlotContext.Provider
      value={{
        slot,
        setSlot,
        backSlot,
        setBackSlot,
        monthSlot,
        setMonthSlot,
        titleEndSlot,
        setTitleEndSlot,
        registered,
        register,
        unregister,
      }}
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

/**
 * The month bar's slot (#401, `MonthBarSlot`): the top of the page's
 * column, above its title (#505). Null outside the shell or before it
 * mounts.
 */
export function usePageMonthSlot(): Slot {
  return useContext(PageActionsSlotContext)?.monthSlot ?? null
}

/** Ref callback for the element that hosts the page's month (`MonthBarSlot`). */
export function useSetPageMonthSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setMonthSlot
}

/**
 * The end of the page title's row (`PageHeader`): the month's status on the
 * dashboard, « Filtres » on phones (#401). Null outside the shell.
 */
export function usePageTitleEndSlot(): Slot {
  return useContext(PageActionsSlotContext)?.titleEndSlot ?? null
}

/** Ref callback for the end of the page title's row (`PageHeader`). */
export function useSetPageTitleEndSlot(): ((slot: Slot) => void) | undefined {
  return useContext(PageActionsSlotContext)?.setTitleEndSlot
}

/**
 * The actions the page's sections put in its menu, after `PageHeader`'s own
 * (#386: every « add » of a page is in the header's « ⋮ »).
 */
export function useRegisteredPageActions(): PageAction[] {
  const registered = useContext(PageActionsSlotContext)?.registered ?? []
  return registered.map(({ id: _id, icon, ...action }) => ({
    ...action,
    icon: icon(),
  }))
}

/**
 * Puts a section's « add » action in the page's « Actions de la page » menu
 * (the header's « ⋮ », #386) instead of a button in the section; `null`
 * takes it out (e.g. when the section is hidden). Returns whether it is in
 * the menu: outside the shell (a component test) it is not, and the
 * section keeps its own button.
 */
export function useRegisterPageAction(action: PageAction | null): boolean {
  const context = useContext(PageActionsSlotContext)
  const register = context?.register
  const unregister = context?.unregister
  const id = useId()
  const latest = useRef(action)
  useEffect(() => {
    latest.current = action
  })
  const present = action !== null
  const label = action?.label ?? ''
  const primary = action?.primary
  const disabled = action?.disabled
  const loading = action?.loading
  const count = action?.count ?? null
  const countValue = count?.value
  const countLabel = count?.label
  useEffect(() => {
    if (!register || !unregister || !present) return
    register({
      id,
      label,
      primary,
      disabled,
      loading,
      count:
        countValue === undefined || countLabel === undefined
          ? null
          : { value: countValue, label: countLabel },
      icon: () => latest.current?.icon,
      onSelect: () => latest.current?.onSelect(),
    })
    return () => unregister(id)
  }, [
    register,
    unregister,
    id,
    present,
    label,
    primary,
    disabled,
    loading,
    countValue,
    countLabel,
  ])
  return context !== null
}
