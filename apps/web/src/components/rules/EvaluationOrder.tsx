import { Badge, Button, Card, CategoryIcon, cn } from '@capi/ui'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useId } from 'react'
import type { CategorizationRuleDto, CategoryDto } from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { MATCH_TYPE_LABELS } from './describe'
import { useDragOrder } from './use-drag-order'

/**
 * « Avancé », folded at the end of the page (#299, the owner's « A. Liste
 * numérotée »): the rules in evaluation order, each a row like the rule
 * list (its rank, the text, its category, a priority badge when set) that
 * opens the rule, whose priority changes the order. Each row has a handle
 * to drag it elsewhere (finger or mouse, or ↑ / ↓ on the focused handle),
 * which sets the fewest priorities giving that order; then « Réappliquer
 * toutes les règles ».
 */
export function EvaluationOrder({
  rules,
  categories,
  applying,
  onApply,
  onEdit,
  onReorder,
  reordering,
}: {
  rules: readonly CategorizationRuleDto[]
  categories: readonly CategoryDto[]
  applying: boolean
  onApply: () => void
  onEdit: (rule: CategorizationRuleDto) => void
  /** The rule ids in their new order, once one was dragged elsewhere. */
  onReorder: (ids: string[]) => void
  /** A new order is being saved: the handles wait. */
  reordering: boolean
}) {
  const hintId = useId()
  const ids = rules.map((rule) => rule.id)
  const order = useDragOrder(ids, onReorder, reordering)
  return (
    <Card size="sm" className="min-w-0 gap-0 py-0">
      <details className="group">
        <summary className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <h2 className="font-semibold">Ordre d’évaluation</h2>
            <span className="text-muted-foreground block text-xs">
              Avancé · {plural(rules.length, 'règle', 'règles')}
            </span>
          </span>
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground size-[0.8rem] shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>

        <div className="border-t">
          <p id={hintId} className="sr-only">
            Glissez la poignée pour changer l’ordre, ou utilisez les flèches
            haut et bas.
          </p>
          <ol aria-label="Ordre d’évaluation" className="divide-y">
            {rules.map((rule) => {
              const category = categories.find((c) => c.id === rule.categoryId)
              const row = order.rowProps(rule.id)
              return (
                <li
                  key={rule.id}
                  ref={row.ref}
                  style={row.style}
                  className={cn(
                    'bg-card flex items-center',
                    row.dragging &&
                      'relative z-10 rounded-lg shadow-lg ring-1 ring-foreground/10',
                    row.moving &&
                      'transition-transform duration-150 motion-reduce:transition-none',
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Déplacer « ${rule.labelPattern} », rang ${rule.rank + 1}`}
                    aria-describedby={hintId}
                    {...order.handleProps(rule.id)}
                    className={cn(
                      'text-muted-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center outline-none select-none focus-visible:ring-[3px] focus-visible:ring-inset disabled:opacity-50',
                      row.dragging ? 'cursor-grabbing' : 'cursor-grab',
                    )}
                  >
                    <GripVerticalIcon aria-hidden className="size-[0.8rem]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(rule)}
                    aria-label={`${rule.rank + 1}. ${MATCH_TYPE_LABELS[rule.matchType]} « ${rule.labelPattern} » → ${category?.name ?? 'catégorie inconnue'}`}
                    className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 pr-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
                  >
                    <span
                      aria-hidden
                      className="bg-muted text-muted-foreground inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums"
                    >
                      {rule.rank + 1}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span
                        className={cn(
                          'block text-sm font-medium break-words',
                          rule.matchType === 'regex' && 'font-mono text-xs',
                          !rule.enabled && 'text-muted-foreground',
                        )}
                      >
                        {rule.labelPattern}
                      </span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                        {/* Icon and name stay on one line. */}
                        <span className="flex max-w-full min-w-0 items-center gap-1.5">
                          {category && (
                            <CategoryIcon
                              icon={category.icon}
                              color={category.color}
                              size="sm"
                            />
                          )}
                          <span className="truncate">
                            {category?.name ?? 'Catégorie inconnue'}
                          </span>
                        </span>
                        {rule.priority !== 0 && (
                          <Badge variant="info" outline>
                            priorité {rule.priority > 0 ? '+' : ''}
                            {rule.priority}
                          </Badge>
                        )}
                        {!rule.enabled && (
                          <Badge variant="secondary" outline>
                            Désactivée
                          </Badge>
                        )}
                      </span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="text-muted-foreground size-[0.8rem] shrink-0"
                    />
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="border-t p-4">
            <Button
              variant="secondary"
              outline
              className="w-full"
              loading={applying}
              iconStart={<WandSparklesIcon />}
              onClick={onApply}
            >
              Réappliquer toutes les règles
            </Button>
          </div>
        </div>
      </details>
    </Card>
  )
}
