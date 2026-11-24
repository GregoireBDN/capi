import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { CategoryDto, UpdateCategoryDto } from '#/api/types.gen'
import { CategoryAvatar } from './category-icons'
import { ColorPalette } from './ColorPalette'
import { IconPicker } from './IconPicker'
import { categoryErrorMessage } from './errors'
import { DEFAULT_CATEGORY_COLOR } from './palette'
import { afterCategoriesChanged, updateCategory } from './queries'

const NAME_MAX = 100

interface CategoryRowProps {
  category: CategoryDto
  onDelete: (category: CategoryDto) => void
}

/**
 * One category: its icon in its colour (opens the colour and icon choice),
 * name (renamed inline) and a menu to rename, archive or restore, and delete.
 */
export function CategoryRow({ category, onDelete }: CategoryRowProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [colorOpen, setColorOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const archived = category.archivedAt !== null

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const update = useMutation({
    mutationFn: (body: UpdateCategoryDto) => updateCategory(category.id, body),
    onSuccess: async (_saved, body) => {
      if (body.name !== undefined) setEditing(false)
      if (body.archived === true) {
        toast.success(`Catégorie ${category.name} archivée`, {
          action: {
            label: 'Annuler',
            onClick: () => update.mutate({ archived: false }),
          },
        })
      } else if (body.archived === false) {
        toast.success(`Catégorie ${category.name} restaurée`)
      }
      await afterCategoriesChanged(queryClient)
    },
    onError: (error) => toast.error(categoryErrorMessage(error)),
  })

  function startRename() {
    setName(category.name)
    setEditing(true)
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === category.name) {
      setEditing(false)
      return
    }
    update.mutate({ name: trimmed })
  }

  const color = category.color ?? DEFAULT_CATEGORY_COLOR

  return (
    <li className="flex min-h-11 items-center gap-2 py-1">
      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Couleur et icône de ${category.name}`}
            disabled={archived}
            className="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <CategoryAvatar category={{ color, icon: category.icon }} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-2rem))] space-y-3 overflow-y-auto"
        >
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium">
              Couleur
            </h3>
            <ColorPalette
              value={color}
              label={`Couleur de ${category.name}`}
              disabled={update.isPending}
              onChange={(next) => {
                if (next !== category.color) update.mutate({ color: next })
              }}
            />
          </section>
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium">Icône</h3>
            <IconPicker
              value={category.icon}
              color={color}
              label={`Icône de ${category.name}`}
              disabled={update.isPending}
              onChange={(next) => {
                setColorOpen(false)
                if (next !== category.icon) update.mutate({ icon: next })
              }}
            />
          </section>
        </PopoverContent>
      </Popover>

      {editing ? (
        <form
          onSubmit={submitRename}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          <Input
            ref={inputRef}
            aria-label={`Nouveau nom de ${category.name}`}
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
            }}
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            variant="primary"
            iconOnly
            aria-label="Enregistrer le nom"
            loading={update.isPending}
          >
            <CheckIcon />
          </Button>
          <Button
            type="button"
            variant="secondary"
            ghost
            iconOnly
            aria-label="Annuler"
            onClick={() => setEditing(false)}
          >
            <XIcon />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={startRename}
          disabled={archived}
          aria-label={`Renommer ${category.name}`}
          className="focus-visible:ring-ring hover:bg-muted min-h-8 min-w-0 flex-1 rounded-md px-1 text-left text-sm break-words hyphens-auto focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
        >
          {category.name}
        </button>
      )}

      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              ghost
              iconOnly
              aria-label={`Actions pour ${category.name}`}
            >
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {archived ? (
              <DropdownMenuItem
                onSelect={() => update.mutate({ archived: false })}
              >
                <ArchiveRestoreIcon />
                Restaurer
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={startRename}>
                  <PencilIcon />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => update.mutate({ archived: true })}
                >
                  <ArchiveIcon />
                  Archiver
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(category)}
            >
              <Trash2Icon />
              Supprimer…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}
