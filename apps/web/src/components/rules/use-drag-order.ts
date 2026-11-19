import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'

/** Distance from the screen edge (px) that scrolls the page while dragging. */
const EDGE = 96
/** Page scroll per frame (px) near an edge. */
const SCROLL_STEP = 10

interface DragState {
  id: string
  from: number
  /** Where the row would land. */
  over: number
  /** Pointer position at the start, in page coordinates. */
  startY: number
  /** How far the row has moved. */
  dy: number
  /** Height of the dragged row: the others step aside by as much. */
  height: number
  /** Middle of each row at the start, in page coordinates. */
  mids: number[]
}

/** `ids` with the one at `from` moved to `to`. */
export function moveId(ids: readonly string[], from: number, to: number) {
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
  return next
}

/**
 * A list reordered by dragging a handle (#299): pointer events, so a finger
 * works as well as a mouse (HTML drag and drop never starts on iOS), the
 * page scrolls near the screen edges, and the arrow keys move the focused
 * handle one place. The rows step aside while a row is dragged; `onMove`
 * gets the new order once it is dropped somewhere else.
 */
export function useDragOrder(
  ids: readonly string[],
  onMove: (next: string[]) => void,
  disabled = false,
) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const pointerY = useRef(0)
  const frame = useRef<number | null>(null)

  function place(state: DragState, clientY: number): DragState {
    const dy = clientY + window.scrollY - state.startY
    const center = state.mids[state.from] + dy
    const over = state.mids.filter(
      (mid, index) => index !== state.from && mid < center,
    ).length
    return { ...state, dy, over }
  }

  // Scroll the page while the finger stays near an edge.
  useEffect(() => {
    if (!drag) return
    const tick = () => {
      const y = pointerY.current
      const step =
        y < EDGE
          ? -SCROLL_STEP
          : y > window.innerHeight - EDGE
            ? SCROLL_STEP
            : 0
      if (step !== 0) {
        window.scrollBy(0, step)
        setDrag((current) => (current ? place(current, y) : current))
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
    // Restarted only when a drag starts or ends.
  }, [drag?.id])

  function handleProps(id: string) {
    const index = ids.indexOf(id)
    return {
      disabled,
      style: { touchAction: 'none' } satisfies CSSProperties,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (disabled || event.button !== 0) return
        event.preventDefault()
        const elements = ids.map((rowId) => rows.current.get(rowId))
        if (elements.some((element) => !element)) return
        const rects = elements.map((element) =>
          element!.getBoundingClientRect(),
        )
        event.currentTarget.setPointerCapture(event.pointerId)
        pointerY.current = event.clientY
        setDrag({
          id,
          from: index,
          over: index,
          startY: event.clientY + window.scrollY,
          dy: 0,
          height: rects[index].height,
          mids: rects.map(
            (rect) => rect.top + window.scrollY + rect.height / 2,
          ),
        })
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!drag) return
        pointerY.current = event.clientY
        setDrag(place(drag, event.clientY))
      },
      onPointerUp: () => {
        if (!drag) return
        if (drag.over !== drag.from) onMove(moveId(ids, drag.from, drag.over))
        setDrag(null)
      },
      onPointerCancel: () => setDrag(null),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (disabled) return
        const step =
          event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
        if (step === 0) return
        event.preventDefault()
        const to = index + step
        if (to < 0 || to >= ids.length) return
        onMove(moveId(ids, index, to))
      },
    }
  }

  /** Ref and offset of a row: the dragged one follows the finger. */
  function rowProps(id: string) {
    const index = ids.indexOf(id)
    let offset = 0
    if (drag) {
      if (id === drag.id) offset = drag.dy
      else if (drag.from < drag.over && index > drag.from && index <= drag.over)
        offset = -drag.height
      else if (drag.over < drag.from && index >= drag.over && index < drag.from)
        offset = drag.height
    }
    return {
      ref: (element: HTMLElement | null) => {
        if (element) rows.current.set(id, element)
        else rows.current.delete(id)
      },
      dragging: drag?.id === id,
      // Only while a row is dragged: the drop itself never animates.
      moving: drag !== null && drag.id !== id,
      style:
        offset === 0
          ? undefined
          : ({ transform: `translateY(${offset}px)` } satisfies CSSProperties),
    }
  }

  return { handleProps, rowProps, dragging: drag !== null }
}
