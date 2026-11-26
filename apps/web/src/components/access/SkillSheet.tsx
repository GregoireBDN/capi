import { Button } from '@capi/ui'
import { DownloadIcon } from 'lucide-react'
import { StepDialog } from './StepDialog'

/** Built from `skills/capi/` by `scripts/build-skill-zip.mjs` (#497). */
export const SKILL_ZIP_URL = '/capi-skill.zip'

/**
 * « Le Skill Capi » (#497): the zip of the Skill (methods only, no access or
 * data) and the few steps to install it; the owner wants as little text as
 * possible.
 */
export function SkillSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <StepDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      label="Installer le Skill Capi"
      description="Les méthodes de Claude pour Capi."
      title="Le Skill Capi"
      action={
        <Button
          type="button"
          className="min-h-11 flex-1 font-medium"
          onClick={onClose}
        >
          Terminé
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <Button asChild variant="primary" fullWidth className="min-h-11">
          <a href={SKILL_ZIP_URL} download="capi-skill.zip">
            <DownloadIcon aria-hidden className="size-4" />
            Télécharger le Skill
          </a>
        </Button>
        <ol className="list-decimal space-y-1 pl-5">
          <li>claude.ai › Paramètres › Fonctionnalités</li>
          <li>Skills › «&nbsp;Importer un skill&nbsp;» › ce fichier</li>
        </ol>
        <p className="text-muted-foreground">
          Claude Code&nbsp;: décompressez-le dans <code>~/.claude/skills/</code>
        </p>
      </div>
    </StepDialog>
  )
}
