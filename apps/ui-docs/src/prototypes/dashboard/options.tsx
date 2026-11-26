import { Button, Checkbox, cn } from '@capi/ui'
import { CheckIcon, ColumnsIcon, SquareIcon } from 'lucide-react'
import { useState } from 'react'
import {
  ACCOUNTS,
  Badge,
  CATALOGUE,
  SheetMock,
  type Placed,
  type Width,
} from './shared'

/**
 * One element's options (#495), the same sheet in every direction: its
 * accounts (all / chosen, Opérations' list with the type icons), its size
 * on a computer, and its own choice (here the days ahead).
 */
export function OptionsSheet({
  width,
  element,
}: {
  width: Width
  element: Placed
}) {
  const info = CATALOGUE[element.type]
  const [all, setAll] = useState(!element.accounts)
  const [chosen, setChosen] = useState<string[]>(element.accounts ?? [])
  const [size, setSize] = useState(element.size ?? 'small')
  const [days, setDays] = useState(7)
  return (
    <SheetMock
      width={width}
      title={info.name}
      icon={<Badge icon={info.icon} tone={info.tone} />}
      footer={
        <Button className="w-full">
          <CheckIcon aria-hidden /> OK
        </Button>
      }
    >
      {element.type === 'upcoming' && (
        <Pills
          value={String(days)}
          options={[
            ['7', '7 jours'],
            ['30', '30 jours'],
          ]}
          onChange={(value) => setDays(Number(value))}
        />
      )}
      {info.accounts && (
        <div className="space-y-1">
          <Pills
            value={all ? 'all' : 'chosen'}
            options={[
              ['all', 'Tous les comptes'],
              ['chosen', 'Choisis'],
            ]}
            onChange={(value) => setAll(value === 'all')}
          />
          <ul className={cn('pt-1', all && 'opacity-40')}>
            {ACCOUNTS.filter(
              (account) => element.type !== 'upcoming' || account.bank === true,
            ).map((account) => {
              const on = all || chosen.includes(account.id)
              return (
                <li key={account.id}>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <Badge icon={account.icon} tone={account.tone} size={28} />
                    <span className="flex-1 font-medium">{account.name}</span>
                    <Checkbox
                      checked={on}
                      disabled={all}
                      onCheckedChange={(checked) =>
                        setChosen((list) =>
                          checked
                            ? [...list, account.id]
                            : list.filter((id) => id !== account.id),
                        )
                      }
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground flex-1">Sur ordinateur</span>
        <Pills
          value={size}
          options={[
            [
              'small',
              <SquareIcon key="s" className="size-4" aria-label="Petit" />,
            ],
            [
              'large',
              <ColumnsIcon key="l" className="size-4" aria-label="Large" />,
            ],
          ]}
          onChange={(value) => setSize(value as 'small' | 'large')}
        />
      </div>
    </SheetMock>
  )
}

/** A few-choice row, the look of the app's segmented control. */
export function Pills({
  value,
  options,
  onChange,
}: {
  value: string
  options: [string, React.ReactNode][]
  onChange: (value: string) => void
}) {
  return (
    <div className="bg-muted inline-flex rounded-full p-[3px] dark:bg-black/25">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'min-h-[1.75rem] rounded-full px-3 text-sm',
            key === value
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
