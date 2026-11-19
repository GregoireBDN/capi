import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from '@finances/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisVerticalIcon,
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  CategorizationRuleDto,
  CategoryDto,
} from '#/api/types.gen'
import { CategoryBadge } from '#/components/transactions/CategoryBadge'
import { KIND_LABELS } from '#/components/transactions/labels'
import {
  categoryProblem,
  describeAccount,
  describeAmount,
  MATCH_TYPE_LABELS,
} from './describe'

interface RuleRowProps {
  rule: CategorizationRuleDto
  /** 0-based place in the evaluation order. */
  index: number
  count: number
  categories: readonly CategoryDto[]
  accounts: readonly AccountDto[]
  /** A reorder or another change is in flight: order controls wait. */
  busy: boolean
  onToggle: (rule: CategorizationRuleDto, enabled: boolean) => void
  onMove: (rule: CategorizationRuleDto, step: -1 | 1) => void
  onEdit: (rule: CategorizationRuleDto) => void
  onDelete: (rule: CategorizationRuleDto) => void
  /** Drag and drop (mouse only): the page tracks the dragged rule. */
  dragging: boolean
  dropTarget: boolean
  onDragStart: (rule: CategorizationRuleDto) => void
  onDragOver: (rule: CategorizationRuleDto) => void
  onDrop: (rule: CategorizationRuleDto) => void
  onDragEnd: () => void
}

/**
 * One rule: its place in the order, pattern and conditions, target category
 * and kind; a switch to enable it, arrows to move it, and a menu to edit or
 * delete it. With a mouse it can also be dragged by its handle.
 */
export function RuleRow({
  rule,
  index,
  count,
  categories,
  accounts,
  busy,
  onToggle,
  onMove,
  onEdit,
  onDelete,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RuleRowProps) {
  // The row is draggable only while its handle is held, so text and buttons
  // inside it behave normally.
  const [armed, setArmed] = useState(false)
  const category = categories.find((c) => c.id === rule.categoryId)
  const problem = categoryProblem(rule, categories)
  const conditions = [
    describeAccount(rule, accounts),
    describeAmount(rule),
  ].filter(Boolean)
  const name = `« ${rule.labelPattern} »`
  const destination =
    rule.counterpartAccountId === null
      ? null
      : (accounts.find((a) => a.id === rule.counterpartAccountId)?.name ?? null)

  return (
    <li
      aria-label={`Règle ${index + 1} : ${rule.labelPattern}`}
      draggable={armed}
      onDragStart={(event) => {
        // Absent from synthetic events (tests); Firefox needs data to drag.
        const transfer = event.dataTransfer as DataTransfer | null
        transfer?.setData('text/plain', rule.id)
        if (transfer) transfer.effectAllowed = 'move'
        onDragStart(rule)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(rule)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(rule)
      }}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
      }}
      className={cn(
        'flex flex-wrap items-start gap-x-2 gap-y-1 py-2',
        dragging && 'opacity-50',
        dropTarget && !dragging && 'ring-primary rounded-md ring-2',
        !rule.enabled && 'text-muted-foreground',
      )}
    >
      <div className="flex min-w-[12rem] flex-1 items-start gap-2">
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          title="Glisser pour déplacer"
          onMouseDown={() => setArmed(true)}
          onMouseUp={() => setArmed(false)}
          className="text-muted-foreground mt-0.5 hidden cursor-grab active:cursor-grabbing pointer-fine:block"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span
          aria-hidden="true"
          className="bg-muted text-muted-foreground mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] tabular-nums"
        >
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onEdit(rule)}
          aria-label={`Modifier la règle ${name}`}
          className="focus-visible:ring-ring hover:bg-muted -my-1 min-w-0 flex-1 space-y-1 rounded-md px-1 py-1 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="block text-sm break-words">
            <span className="text-muted-foreground">
              {MATCH_TYPE_LABELS[rule.matchType]}{' '}
            </span>
            <span
              className={cn(
                'font-medium',
                rule.matchType === 'regex' && 'font-mono text-xs',
              )}
            >
              {name}
            </span>
          </span>
          {conditions.length > 0 && (
            <span className="text-muted-foreground block text-xs break-words">
              {conditions.join(' · ')}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            {category ? (
              <CategoryBadge category={category} />
            ) : (
              <span className="text-muted-foreground">Catégorie inconnue</span>
            )}
            {rule.kind && (
              <span className="text-muted-foreground">
                {KIND_LABELS[rule.kind]}
              </span>
            )}
            {rule.merchant && (
              <span className="text-muted-foreground break-words">
                marchand « {rule.merchant} »
              </span>
            )}
            {destination && (
              <span className="text-muted-foreground break-words">
                vers {destination}
              </span>
            )}
          </span>
          {(problem || !rule.enabled) && (
            <span className="flex flex-wrap gap-1.5">
              {problem === 'archived' && (
                <Badge variant="warning">Catégorie archivée</Badge>
              )}
              {problem === 'deleted' && (
                <Badge variant="danger">Catégorie supprimée</Badge>
              )}
              {!rule.enabled && (
                <Badge variant="secondary" outline>
                  Désactivée
                </Badge>
              )}
            </span>
          )}
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(checked) => onToggle(rule, checked)}
          aria-label={`Activer la règle ${name}`}
          className="mx-2"
        />
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label={`Monter la règle ${name}`}
          disabled={busy || index === 0}
          onClick={() => onMove(rule, -1)}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label={`Descendre la règle ${name}`}
          disabled={busy || index === count - 1}
          onClick={() => onMove(rule, 1)}
        >
          <ArrowDownIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              ghost
              iconOnly
              aria-label={`Actions pour la règle ${name}`}
            >
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(rule)}>
              <PencilIcon />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(rule)}
            >
              <Trash2Icon />
              Supprimer…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
