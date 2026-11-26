import { EyeIcon, EyeOffIcon } from 'lucide-react'
import * as React from 'react'
import { fieldSurface } from '../lib/field'
import { cn } from '../lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, placeholder = ' ', ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          data-slot="input"
          className={cn(
            [
              'h-9 w-full min-w-0',
              'px-3 py-1 pr-11',
              fieldSurface,
              'text-base md:text-sm',
              'disabled:pointer-events-none',
            ].join(' '),
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={
            visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
          }
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {visible ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'

export { PasswordInput, type PasswordInputProps }
