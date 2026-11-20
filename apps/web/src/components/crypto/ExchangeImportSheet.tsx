import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Sheet,
  SheetContent,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlertIcon, PencilIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  CryptoAssetChoiceDto,
  CryptoImportDto,
  CryptoImportHoldingDto,
} from '#/api/types.gen'
import { accountKeys } from '#/components/accounts/queries'
import { FileDropzone } from '#/components/import/FileDropzone'
import { formatCents } from '#/lib/money'
import {
  commitExport,
  discardExport,
  exchangeImportErrorMessage,
  FORMAT_LABELS,
  formatInstant,
  KIND_LABELS,
  lineList,
  MAX_EXPORT_BYTES,
  periodText,
  previewExport,
} from './exchange-import'
import { formatQuantity } from './format'
import { AssetPicker } from './HoldingEditor'
import type { Asset } from './HoldingEditor'
import { afterHoldingsChanged } from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

/** Lines of the file listed in the preview, at most. */
const SHOWN_ROWS = 100

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`

export function isCsv(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type.includes('csv')
}

/** Picks the price id of a ticker the API could not map. */
function UnmappedTicker({
  ticker,
  choice,
  onChoose,
}: {
  ticker: string
  choice: Asset | undefined
  onChoose: (asset: Asset | undefined) => void
}) {
  const id = useId()
  const [picking, setPicking] = useState(false)
  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[9rem] flex-1">
          <p className="font-medium">{ticker}</p>
          <p className="text-muted-foreground text-sm">
            {choice
              ? `→ ${choice.name} (${choice.symbol.toUpperCase()})`
              : 'Aucun actif associé'}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          outline
          iconStart={<PencilIcon />}
          onClick={() => setPicking((open) => !open)}
          aria-expanded={picking}
          aria-controls={id}
        >
          {choice ? 'Changer' : 'Associer un actif'}
        </Button>
      </div>
      {picking && (
        <div id={id}>
          <AssetPicker
            id={`${id}-search`}
            invalid={false}
            onPick={(asset) => {
              onChoose(asset)
              setPicking(false)
            }}
          />
        </div>
      )}
    </li>
  )
}

function HoldingRow({ holding }: { holding: CryptoImportHoldingDto }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
      <div className="min-w-[7rem] flex-1">
        <span className="font-medium">{holding.symbol}</span>
        {holding.name && (
          <span className="text-muted-foreground"> · {holding.name}</span>
        )}
        {holding.status === 'negative' && (
          <Badge variant="warning" outline className="ml-2">
            Historique incomplet
          </Badge>
        )}
        {holding.status === 'unmapped' && (
          <Badge variant="warning" outline className="ml-2">
            Sans cours
          </Badge>
        )}
      </div>
      <div className="ml-auto text-right whitespace-nowrap tabular-nums">
        <div>{formatQuantity(holding.quantity)}</div>
        <div className="text-muted-foreground text-xs">
          {holding.investedCents === null
            ? 'Investi inconnu'
            : `Investi ${formatCents(holding.investedCents)}`}
        </div>
      </div>
    </li>
  )
}

export function Preview({
  detail,
  choices,
  onChoose,
}: {
  detail: CryptoImportDto
  choices: Record<string, Asset>
  onChoose: (ticker: string, asset: Asset | undefined) => void
}) {
  const period = periodText(detail)
  const counts = detail.counts
  const negative = detail.holdings.filter((h) => h.status === 'negative')
  const holdings = detail.holdings
  const shownRows = detail.rows.slice(0, SHOWN_ROWS)
  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p className="font-medium break-all">{detail.fileName}</p>
        <p className="text-muted-foreground">
          Export {FORMAT_LABELS[detail.format]}
          {period && `, ${period}`}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1" aria-label="Lignes">
          <li>{plural(counts.new, 'nouvelle ligne', 'nouvelles lignes')}</li>
          <li className="text-muted-foreground">
            {plural(counts.duplicates, 'déjà importée', 'déjà importées')}
          </li>
          {counts.issues > 0 && (
            <li className="text-muted-foreground">
              {plural(counts.issues, 'illisible', 'illisibles')}
            </li>
          )}
        </ul>
      </div>

      {counts.new === 0 && (
        <Alert>
          <AlertTitle>Rien de nouveau</AlertTitle>
          <AlertDescription>
            Toutes les lignes de ce fichier sont déjà importées.
          </AlertDescription>
        </Alert>
      )}

      {detail.unknownOperations.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>Opérations non reconnues</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {detail.unknownOperations.map((op) => (
                <li key={op.operation}>
                  {op.operation} ({op.count})
                </li>
              ))}
            </ul>
            <p>Leurs quantités sont tout de même comptées dans les avoirs.</p>
          </AlertDescription>
        </Alert>
      )}

      {detail.issues.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>Lignes ignorées</AlertTitle>
          <AlertDescription>
            {lineList(detail.issues.map((issue) => issue.lineNumber))} : date,
            actif ou quantité illisible.
          </AlertDescription>
        </Alert>
      )}

      {negative.length > 0 && (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>Historique incomplet</AlertTitle>
          <AlertDescription>
            Le solde de {negative.map((h) => h.symbol).join(', ')} serait
            négatif : importez aussi les exports plus anciens. Ces actifs ne
            sont pas ajoutés aux avoirs.
          </AlertDescription>
        </Alert>
      )}

      {detail.unmappedTickers.length > 0 && (
        <section aria-labelledby="unmapped-title" className="space-y-1">
          <h3 id="unmapped-title" className="text-sm font-semibold">
            Actifs sans cours
          </h3>
          <p className="text-muted-foreground text-sm">
            Associez-les à un actif pour les ajouter aux avoirs.
          </p>
          <ul className="divide-y">
            {detail.unmappedTickers.map((ticker) => (
              <UnmappedTicker
                key={ticker}
                ticker={ticker}
                choice={choices[ticker]}
                onChoose={(asset) => onChoose(ticker, asset)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="holdings-title" className="space-y-1">
        <h3 id="holdings-title" className="text-sm font-semibold">
          Avoirs après l’import
        </h3>
        {holdings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun avoir.</p>
        ) : (
          <ul className="divide-y" aria-label="Avoirs après l’import">
            {holdings.map((holding) => (
              <HoldingRow
                key={holding.assetId ?? holding.symbol}
                holding={holding}
              />
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">
          Les euros restés sur la plateforme ne sont pas comptés. Vos avoirs
          saisis à la main ne changent pas.
        </p>
      </section>

      {detail.rows.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer py-2 font-medium">
            Lignes du fichier ({detail.rows.length.toLocaleString('fr-FR')})
          </summary>
          <ul className="divide-y">
            {shownRows.map((row) => (
              <li
                key={row.index}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5"
              >
                <div className="min-w-[7rem] flex-1">
                  <div>
                    {row.known ? KIND_LABELS[row.kind] : row.operation}
                    {row.status === 'duplicate' && (
                      <span className="text-muted-foreground">
                        {' '}
                        · déjà importée
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatInstant(row.occurredAt)}
                  </div>
                </div>
                <div className="ml-auto whitespace-nowrap tabular-nums">
                  {formatQuantity(row.quantity)} {row.asset}
                </div>
              </li>
            ))}
          </ul>
          {detail.rows.length > SHOWN_ROWS && (
            <p className="text-muted-foreground py-1 text-xs">
              {SHOWN_ROWS} premières lignes affichées.
            </p>
          )}
        </details>
      )}
    </div>
  )
}

/**
 * "Importer un export" of an exchange account: pick the Binance or Coinbase
 * "Transactions" CSV, check the preview (new and already imported lines,
 * unknown operations, holdings after the import), map the tickers without a
 * price, confirm. Nothing is written before the confirmation; closing the
 * sheet discards the pending import.
 */
export function ExchangeImportSheet({
  open,
  onOpenChange,
  accountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [detail, setDetail] = useState<CryptoImportDto>()
  const [choices, setChoices] = useState<Record<string, Asset>>({})
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!open) return
    setDetail(undefined)
    setChoices({})
    setError(undefined)
  }, [open])

  const upload = useMutation({
    mutationFn: (file: File) => previewExport(accountId, file),
    onSuccess: (result) => {
      setError(undefined)
      setDetail(result)
    },
    onError: (err) => setError(exchangeImportErrorMessage(err)),
  })

  const commit = useMutation({
    mutationFn: (pending: CryptoImportDto) =>
      commitExport(
        pending.id,
        Object.entries(choices).map(
          ([ticker, asset]): CryptoAssetChoiceDto => ({
            ticker,
            assetId: asset.id,
            symbol: asset.symbol.toUpperCase().slice(0, 20),
            name: asset.name.slice(0, 100),
          }),
        ),
      ),
    onSuccess: async (result) => {
      toast.success(
        result.counts.inserted === 0
          ? 'Export importé : rien de nouveau'
          : `Export importé : ${plural(result.counts.inserted, 'ligne ajoutée', 'lignes ajoutées')}`,
      )
      setDetail(undefined)
      onOpenChange(false)
      await Promise.all([
        afterHoldingsChanged(queryClient),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
      ])
    },
    onError: (err) => setError(exchangeImportErrorMessage(err)),
  })

  function send(file: File) {
    setError(undefined)
    if (!isCsv(file)) {
      setError('Choisissez le fichier .csv exporté depuis la plateforme.')
      return
    }
    if (file.size > MAX_EXPORT_BYTES) {
      setError('Le fichier dépasse la taille maximale de 5 Mo.')
      return
    }
    upload.mutate(file)
  }

  function close(next: boolean) {
    if (!next && detail && detail.status === 'pending' && !commit.isPending) {
      // Nothing was written: drop the pending import.
      discardExport(detail.id).catch(() => undefined)
    }
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto sm:max-w-lg'}
      >
        <EditorHeader
          title={<>Importer un export</>}
          description={
            <>
              Export « Transactions » de Binance ou de Coinbase, au format CSV.
            </>
          }
          className="pb-0"
        />
        <SheetScroll className="space-y-4 px-4 pb-6">
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          {detail ? (
            <>
              <Preview
                detail={detail}
                choices={choices}
                onChoose={(ticker, asset) =>
                  setChoices((current) => {
                    const next = { ...current }
                    if (asset) next[ticker] = asset
                    else delete next[ticker]
                    return next
                  })
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-w-[8rem] flex-1"
                  loading={commit.isPending}
                  onClick={() => commit.mutate(detail)}
                >
                  {detail.counts.new === 0
                    ? 'Valider'
                    : `Importer ${plural(detail.counts.new, 'ligne', 'lignes')}`}
                </Button>
                <Button
                  variant="secondary"
                  outline
                  className="min-w-[8rem] flex-1"
                  disabled={commit.isPending}
                  onClick={() => close(false)}
                >
                  Annuler
                </Button>
              </div>
            </>
          ) : (
            <FileDropzone
              onFile={send}
              busy={upload.isPending}
              hint="Binance ou Coinbase, 5 Mo maximum"
            />
          )}
        </SheetScroll>
      </SheetContent>
    </Sheet>
  )
}
