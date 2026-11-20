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
  icon: () => ReactNode
  onSelect: () => void
}

const PageActionsSlotContext = createContext<{
  slot: Slot
  setSlot: (slot: Slot) => void
  backSlot: Slot
  setBackSlot: (slot: Slot) => void
  registered: readonly RegisteredAction[]
  register: (action: RegisteredAction) => void
  unregister: (id: string) => void
} | null>(null)

/**
 * Lets `AppHeader` host the way back of the page shown (every width) and its
 * actions (phones): the header registers its slot elements,
 * `PageBack` and `PageHeader` render into them through portals.
 */
export function PageActionsSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Slot>(null)
  const [backSlot, setBackSlot] = useState<Slot>(null)
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
  useEffect(() => {
    if (!register || !unregister || !present) return
    register({
      id,
      label,
      primary,
      disabled,
      loading,
      icon: () => latest.current?.icon,
      onSelect: () => latest.current?.onSelect(),
    })
    return () => unregister(id)
  }, [register, unregister, id, present, label, primary, disabled, loading])
  return context !== null
}
