import { Button } from '@finances/ui'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'

/**
 * A block of text to paste somewhere else (a config, a command, an address)
 * with its « Copier » button. It scrolls sideways inside itself, never the
 * page.
 */
export function CopyBlock({
  label,
  text,
  copiedMessage = 'Copié',
}: {
  label: string
  text: string
  copiedMessage?: string
}) {
  const id = useId()
  const [copied, setCopied] = useState(false)

  // A new text (another path, another app) has not been copied yet.
  useEffect(() => setCopied(false), [text])

  async function copy() {
    try {
      await writeClipboard(text)
      setCopied(true)
      toast.success(copiedMessage)
    } catch {
      toast.error('Copie impossible. Sélectionnez le texte et copiez-le.')
    }
  }

  return (
    <figure aria-labelledby={`${id}-label`} className="min-w-0 space-y-1.5">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <figcaption
          id={`${id}-label`}
          className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]"
        >
          {label}
        </figcaption>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          outline
          className="shrink-0"
          aria-label={`Copier : ${label}`}
          iconStart={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={() => void copy()}
        >
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>
      <pre
        tabIndex={0}
        className="bg-muted focus-visible:ring-ring max-w-full overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed outline-none select-all focus-visible:ring-2"
      >
        {text}
      </pre>
    </figure>
  )
}

/**
 * The clipboard API needs a secure context; over plain HTTP (the phone on
 * the LAN in dev) the older `execCommand('copy')` on a hidden field still
 * works.
 */
async function writeClipboard(text: string): Promise<void> {
  if (window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  try {
    field.select()
    field.setSelectionRange(0, text.length)
    if (!document.execCommand('copy')) throw new Error('copy refused')
  } finally {
    field.remove()
  }
}
