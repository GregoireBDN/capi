import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

/** The list with the item at `from` taken out and put back at `to`. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from === to || from < 0 || from >= list.length) return next
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

/**
 * Where a dragged row lands: a row below moves up once the dragged row's
 * bottom edge passes its middle, a row above moves down once its top edge
 * does. `rows` are the rows' top and height when the drag began, in order.
 */
export function dropIndex(
  rows: readonly { top: number; height: number }[],
  from: number,
  offset: number,
): number {
  const top = rows[from].top + offset
  const bottom = top + rows[from].height
  let index = 0
  rows.forEach((row, i) => {
    const middle = row.top + row.height / 2
    if (i < from ? middle < top : i > from && middle < bottom) index += 1
  })
  return index
}

type Drag = {
  from: number
  to: number
  offset: number
  /** The rows' top and height when the drag began. */
  rows: { top: number; height: number }[]
  /** Set while the row glides to its place, before the order changes. */
  dropping: boolean
}

const EDGE = 56
const DROP_MS = 180

function buzz(ms: number) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms)
  } catch {
    // Not every browser lets a page vibrate.
  }
}

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let el = node?.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
  }
  return null
}

/**
 * Reordering a vertical list by dragging a handle (#495): the row lifts,
 * the others slide out of its way, it glides into its place when let go.
 * Pointer (touch and mouse) on the handle only, so a tap on the row and
 * scrolling the list keep working; the scroll area follows the finger near
 * its edges. From the keyboard, ↑ ↓ on the focused handle move the row.
 */
export function useSortable({
  count,
  onMove,
}: {
  count: number
  onMove: (from: number, to: number) => void
}) {
  const items = useRef<(HTMLElement | null)[]>([])
  const [drag, setDragState] = useState<Drag | null>(null)
  // Read by the window listeners, which run between renders.
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  function start(index: number, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || dragRef.current) return
    event.preventDefault()
    const handle = event.currentTarget
    try {
      // Keeps the moves coming when the finger leaves the handle.
      handle.setPointerCapture(event.pointerId)
    } catch {
      // A pointer the browser no longer knows: the window listeners do.
    }
    const rows = items.current.slice(0, count).map((el) => {
      const rect = el?.getBoundingClientRect()
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 }
    })
    const scroller = scrollParent(items.current[index] ?? null)
    const startY = event.clientY
    const startScroll = scroller?.scrollTop ?? 0
    let pointerY = startY
    let frame = 0

    const update = () => {
      const current = dragRef.current
      if (!current || current.dropping) return
      const offset =
        pointerY - startY + ((scroller?.scrollTop ?? 0) - startScroll)
      const to = dropIndex(rows, index, offset)
      if (to !== current.to) buzz(6)
      setDrag({ ...current, offset, to })
    }
    const follow = () => {
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const speed =
          pointerY < box.top + EDGE
            ? -Math.ceil((box.top + EDGE - pointerY) / 6)
            : pointerY > box.bottom - EDGE
              ? Math.ceil((pointerY - (box.bottom - EDGE)) / 6)
              : 0
        if (speed) {
          scroller.scrollTop += speed
          update()
        }
      }
      frame = requestAnimationFrame(follow)
    }
    const move = (e: PointerEvent) => {
      pointerY = e.clientY
      update()
    }
    const end = (e: PointerEvent) => {
      // A cancelled pointer (the system took it) has no position to trust.
      if (e.type === 'pointerup') {
        pointerY = e.clientY
        update()
      }
      stop()
      const current = dragRef.current
      if (!current) return
      const { from, to } = current
      const glide = slotTop(rows, from, to) - rows[from].top
      setDrag({ ...current, offset: glide, dropping: true })
      buzz(12)
      const timer = window.setTimeout(() => {
        setDrag(null)
        if (from !== to) onMoveRef.current(from, to)
      }, DROP_MS)
      cleanup.current = () => window.clearTimeout(timer)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      cleanup.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    cleanup.current = stop
    frame = requestAnimationFrame(follow)
    buzz(10)
    setDrag({ from: index, to: index, offset: 0, rows, dropping: false })
  }

  function keyDown(index: number, event: ReactKeyboardEvent<HTMLElement>) {
    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!by) return
    event.preventDefault()
    const to = index + by
    if (to < 0 || to >= count) return
    onMoveRef.current(index, to)
  }

  /** What a row needs: its ref and its style while something is dragged. */
  function item(index: number): {
    ref: (el: HTMLElement | null) => void
    style: CSSProperties | undefined
    dragging: boolean
  } {
    const ref = (el: HTMLElement | null) => {
      items.current[index] = el
    }
    if (!drag) return { ref, style: undefined, dragging: false }
    const { from, to, offset, rows, dropping } = drag
    if (index === from) {
      return {
        ref,
        dragging: true,
        style: {
          transform: `translateY(${offset}px) scale(${dropping ? 1 : 1.03})`,
          transition: dropping
            ? `transform ${DROP_MS}ms cubic-bezier(.2,.9,.3,1.2)`
            : 'transform 80ms ease-out',
          position: 'relative',
          zIndex: 10,
        },
      }
    }
    const step = rows[from].height
    const shift =
      from < to && index > from && index <= to
        ? -step
        : from > to && index >= to && index < from
          ? step
          : 0
    return {
      ref,
      dragging: false,
      style: {
        transform: shift ? `translateY(${shift}px)` : undefined,
        transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)',
      },
    }
  }

  return {
    item,
    dragging: drag !== null,
    handle: (index: number) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
        start(index, event),
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) =>
        keyDown(index, event),
    }),
  }
}

/** The top the row at `from` takes once moved to `to`. */
function slotTop(
  rows: readonly { top: number; height: number }[],
  from: number,
  to: number,
): number {
  if (to === from) return rows[from].top
  return to > from
    ? rows[to].top + rows[to].height - rows[from].height
    : rows[to].top
}
