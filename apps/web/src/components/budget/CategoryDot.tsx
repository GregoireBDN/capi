/** Colour swatch of a category (identity; the name always sits beside it). */
export function CategoryDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="bg-muted-foreground inline-block size-2.5 shrink-0 rounded-full"
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}
