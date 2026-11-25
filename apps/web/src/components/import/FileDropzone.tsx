import { cn, Spinner } from '@capi/ui'
import { FileUpIcon } from 'lucide-react'
import { useId, useState } from 'react'

interface FileDropzoneProps {
  onFile: (file: File) => void
  disabled?: boolean
  busy?: boolean
  /** Line under the label (format and size limit). */
  hint?: string
}

/**
 * CSV picker: a tap opens the native file picker (phones), a drop works on
 * desktop. The input is reset after each pick so the same file can be sent
 * again.
 */
export function FileDropzone({
  onFile,
  disabled,
  busy,
  hint = 'Export CSV de votre banque, 5 Mo maximum',
}: FileDropzoneProps) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const inactive = disabled || busy

  function pick(files: FileList | null) {
    const file = files?.[0]
    if (file && !inactive) onFile(file)
  }

  return (
    <label
      htmlFor={inputId}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        event.preventDefault()
        if (!inactive) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        pick(event.dataTransfer.files)
      }}
      className={cn(
        'flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
        'focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-2',
        'hover:border-primary/50 data-[dragging]:border-primary data-[dragging]:bg-primary/5',
        inactive && 'pointer-events-none opacity-60',
      )}
    >
      {busy ? (
        <>
          <Spinner className="size-6" />
          <span className="text-sm font-medium" role="status">
            Analyse du fichier…
          </span>
        </>
      ) : (
        <>
          <FileUpIcon className="text-muted-foreground size-7" />
          <span className="text-sm font-medium">
            Choisir un fichier CSV
            <span className="text-muted-foreground hidden font-normal md:inline">
              {' '}
              ou le déposer ici
            </span>
          </span>
          <span className="text-muted-foreground text-xs">{hint}</span>
        </>
      )}
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel"
        className="sr-only"
        aria-label="Fichier CSV"
        disabled={inactive}
        onChange={(event) => {
          pick(event.target.files)
          event.target.value = ''
        }}
      />
    </label>
  )
}
