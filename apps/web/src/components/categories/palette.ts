/**
 * Swatches offered for a category: the chart palette (`--chart-1` … `--chart-8`
 * and `--chart-other` of `@capi/ui/globals.css`, light values), so
 * categories match the charts.
 */
export const CATEGORY_PALETTE = [
  { value: '#2a78d6', label: 'Bleu' },
  { value: '#eb6834', label: 'Orange' },
  { value: '#1baf7a', label: 'Vert d’eau' },
  { value: '#eda100', label: 'Jaune' },
  { value: '#e87ba4', label: 'Rose' },
  { value: '#008300', label: 'Vert' },
  { value: '#6250d6', label: 'Violet' },
  { value: '#e34948', label: 'Rouge' },
  { value: '#8a8f9c', label: 'Gris' },
] as const

export const DEFAULT_CATEGORY_COLOR = CATEGORY_PALETTE[0].value
