import type { DashboardWidgetDto } from '#/api/types.gen'

export type GlanceRowType = 'forecast' | 'net_worth'

export type Block =
  | {
      kind: 'glance'
      widget: DashboardWidgetDto
      rows: GlanceRowType[]
    }
  | { kind: 'single'; widget: DashboardWidgetDto }

/**
 * The visible elements as the page draws them (#495). « Fin de mois » and
 * « Patrimoine » placed right after « Reste à dépenser », on all their
 * accounts, stay rows of its card, as on today's dashboard (#405); anywhere
 * else, or on chosen accounts, each is a card of its own.
 */
export function groupWidgets(widgets: DashboardWidgetDto[]): Block[] {
  const blocks: Block[] = []
  for (const widget of widgets) {
    if (widget.hidden) continue
    const last = blocks.at(-1)
    if (
      last?.kind === 'glance' &&
      (widget.type === 'forecast' || widget.type === 'net_worth') &&
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
