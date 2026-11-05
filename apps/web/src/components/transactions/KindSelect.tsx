import { NativeSelect, NativeSelectOption } from '@finances/ui'
import type { TransactionKind } from '#/api/types.gen'
import { KIND_LABELS, TRANSACTION_KINDS } from './labels'

interface KindSelectProps {
  value: TransactionKind
  onChange: (kind: TransactionKind) => void
  label: string
  disabled?: boolean
  className?: string
}

/** Kind override: expense, income or internal transfer. */
export function KindSelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: KindSelectProps) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      className={className}
      onChange={(event) => onChange(event.target.value as TransactionKind)}
    >
      {TRANSACTION_KINDS.map((kind) => (
        <NativeSelectOption key={kind} value={kind}>
          {KIND_LABELS[kind]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
