import { Button } from '@capi/ui'
import { DownloadIcon } from 'lucide-react'
import { StepDialog } from './StepDialog'

/** Built from `skills/capi/` by `scripts/build-skill-zip.mjs` (#497). */
export const SKILL_ZIP_URL = '/capi-skill.zip'

/**
 * « Le Skill Capi » (#497): the zip of the Skill to upload to claude.ai (it
 * then follows the account to Claude Desktop and the phone), and where to put
 * it for Claude Code. The Skill holds methods only: no token, no address.
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
      description="Les méthodes de Claude pour Capi, à installer une fois."
      title="Installez le Skill Capi"
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
        <p className="text-pretty">
          Le Skill apprend à Claude comment faire le bilan du mois, importer un
          relevé ou mettre à jour vos placements avec Capi. Claude le lit
          seulement quand vous lui parlez de vos finances. Il ne contient ni
          accès ni donnée&nbsp;: Claude a aussi besoin d’être connecté
          ci-dessus.
        </p>
        <Button asChild variant="primary" fullWidth className="min-h-11">
          <a href={SKILL_ZIP_URL} download="capi-skill.zip">
            <DownloadIcon aria-hidden className="size-4" />
            Télécharger le Skill
          </a>
        </Button>
        <div className="space-y-1">
          <p className="font-medium">claude.ai, Claude Desktop, téléphone</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Dans claude.ai (sur ordinateur)&nbsp;: Paramètres ›
              Fonctionnalités, activez l’exécution de code.
            </li>
            <li>
              Sous Skills, «&nbsp;Importer un skill&nbsp;» avec le fichier
              téléchargé, puis activez-le. Il suit votre compte sur Claude
              Desktop et le téléphone.
            </li>
          </ol>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Claude Code</p>
          <p className="text-pretty">
            Décompressez le fichier dans <code>~/.claude/skills/</code> (il crée
            le dossier <code>capi</code>), puis vérifiez avec{' '}
            <code>/skills</code>.
          </p>
        </div>
        <p className="text-muted-foreground text-pretty">
          Ensuite, demandez simplement «&nbsp;fais le bilan d’octobre&nbsp;» ou
          «&nbsp;importe ce relevé&nbsp;». Après une mise à jour de Capi,
          retéléchargez-le pour avoir la dernière version.
        </p>
      </div>
    </StepDialog>
  )
}
