import {
  Card,
  CardContent,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  Switch,
} from '@finances/ui'
import { useEffect, useId, useState } from 'react'
import type { AccountDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import type { AmountSign } from '#/components/amount/signed-amount'
import { parseThreshold, THRESHOLD_LIMIT, thresholdToInput } from './threshold'

interface ForecastSettingsProps {
  /** Checking and savings accounts that can be projected. */
  accounts: AccountDto[]
  selectedIds: readonly string[]
  onSelectedIdsChange: (ids: string[]) => void
  thresholdCents: number
  onThresholdChange: (cents: number) => void
  includeVariable: boolean
  onIncludeVariableChange: (value: boolean) => void
}

/** Accounts, low-balance threshold and the variable-spending toggle. */
export function ForecastSettings({
  accounts,
  selectedIds,
  onSelectedIdsChange,
  thresholdCents,
  onThresholdChange,
  includeVariable,
  onIncludeVariableChange,
}: ForecastSettingsProps) {
  const id = useId()
  const [text, setText] = useState(
    () => thresholdToInput(thresholdCents).amount,
  )
  const [sign, setSign] = useState(() => thresholdToInput(thresholdCents).sign)
  const [error, setError] = useState<string | null>(null)

  // The saved threshold is read after hydration (and may change elsewhere).
  useEffect(() => {
    const shown = thresholdToInput(thresholdCents)
    setText(shown.amount)
    setSign(shown.sign)
    setError(null)
  }, [thresholdCents])

  function commit(withSign: AmountSign = sign) {
    const cents = parseThreshold(text, withSign)
    if (cents === null) {
      setError('Montant invalide (ex. 200 ou 150,50)')
      return
    }
    setError(null)
    if (cents === thresholdCents) {
      const shown = thresholdToInput(cents)
      setText(shown.amount)
      setSign(shown.sign)
    } else onThresholdChange(cents)
  }

  function toggle(accountId: string, checked: boolean) {
    const next = checked
      ? [...selectedIds, accountId]
      : selectedIds.filter((selected) => selected !== accountId)
    if (next.length > 0) onSelectedIdsChange(next)
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-4 @2xl:grid-cols-3">
        {accounts.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Comptes</legend>
            {accounts.map((account) => {
              const checked = selectedIds.includes(account.id)
              return (
                <div key={account.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-${account.id}`}
                    checked={checked}
                    // At least one account stays selected.
                    disabled={checked && selectedIds.length === 1}
                    onCheckedChange={(value) =>
                      toggle(account.id, value === true)
                    }
                  />
                  <Label
                    htmlFor={`${id}-${account.id}`}
                    className="min-w-0 truncate font-normal"
                  >
                    {account.name}
                  </Label>
                </div>
              )
            })}
          </fieldset>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            commit()
          }}
        >
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor={`${id}-threshold`}>Seuil d’alerte</FieldLabel>
            <AmountField
              id={`${id}-threshold`}
              maxCents={THRESHOLD_LIMIT}
              value={text}
              onValueChange={(typed, typedSign) => {
                setText(typed)
                if (typedSign) setSign(typedSign)
              }}
              sign={sign}
              onSignChange={(next) => {
                setSign(next)
                // Saved at once, unless the amount is not one yet.
                if (parseThreshold(text, next) !== null) commit(next)
              }}
              aria-invalid={error !== null}
              aria-describedby={`${id}-threshold-help`}
              onBlur={() => commit()}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription id={`${id}-threshold-help`}>
                Alerte si le solde prévu passe en dessous. « − » pour un seuil
                sous 0 € (découvert). Enregistré sur cet appareil.
              </FieldDescription>
            )}
          </Field>
        </form>

        <div className="flex items-start gap-3">
          <Switch
            id={`${id}-variable`}
            checked={includeVariable}
            onCheckedChange={onIncludeVariableChange}
          />
          <div className="space-y-0.5">
            <Label htmlFor={`${id}-variable`} className="font-normal">
              Inclure les dépenses courantes estimées
            </Label>
            <p className="text-muted-foreground text-xs">
              Moyenne quotidienne des 3 derniers mois, hors abonnements,
              virements et dépenses ponctuelles.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
