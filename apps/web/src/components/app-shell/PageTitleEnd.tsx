import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useInShell, usePageTitleEndSlot } from './page-actions'

/**
 * Puts something at the end of the page title's row (`PageHeader`, #401):
 * the month's status on the dashboard, « Filtres » on phones. It arrives
 * once the page has mounted, like the page's actions; outside the shell
 * (a component test) it stays where it is rendered.
 */
export function PageTitleEnd({ children }: { children: ReactNode }) {
  const inShell = useInShell()
  const slot = usePageTitleEndSlot()
  if (!inShell) return <>{children}</>
  return slot === null ? null : createPortal(children, slot)
}
