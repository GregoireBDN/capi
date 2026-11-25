import { cn } from '@capi/ui'

/** Discs for contacts: one per name, never a meaning (#359). */
const COLORS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
  'bg-chart-7',
  'bg-chart-8',
]

function colorOf(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

/** Up to two initials. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? `${words[0][0]}${words[1][0]}`
      : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** A contact's initials on a disc of their own colour. */
export function ContactAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-7 text-[0.6rem]' : 'size-8 text-xs',
        colorOf(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
