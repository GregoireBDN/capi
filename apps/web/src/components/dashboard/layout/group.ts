import type { DashboardWidgetDto } from '#/api/types.gen'

export type GlanceRowType = 'forecast'

export type Block =
  | {
      kind: 'glance'
      widget: DashboardWidgetDto
      rows: GlanceRowType[]
    }
  | { kind: 'single'; widget: DashboardWidgetDto }

/**
 * The visible elements as the page draws them (#495). « Fin de mois »
 * placed right after « Reste à dépenser », on all its accounts, stays a row
 * of its card, as on today's dashboard (#405); anywhere else, or on chosen
 * accounts, it is a card of its own. « Patrimoine », a curve since #495, is
 * always a card of its own.
 */
export function groupWidgets(widgets: DashboardWidgetDto[]): Block[] {
  const blocks: Block[] = []
  for (const widget of widgets) {
    if (widget.hidden) continue
    const last = blocks.at(-1)
    if (
      last?.kind === 'glance' &&
      widget.type === 'forecast' &&
      widget.accountIds === null &&
      !last.rows.includes(widget.type)
    ) {
      last.rows.push(widget.type)
      continue
    }
    blocks.push(
      widget.type === 'left_to_spend'
        ? { kind: 'glance', widget, rows: [] }
        : { kind: 'single', widget },
    )
  }
  return blocks
}
