import type {
  CommitImportDto,
  ConflictAction,
  ImportPreviewRowDto,
} from '#/api'

/**
 * Choices made in the preview, keyed by the row's line in the file: a line
 * typed in the preview (#433) renumbers the rows, never the lines.
 */
export interface PreviewChoices {
  /** Conflict rows only; a conflict without a choice is skipped. */
  conflicts: Record<number, ConflictAction | undefined>
  /** Category picked in place of the proposed one. */
  categories: Record<number, string | undefined>
}

export const EMPTY_CHOICES: PreviewChoices = { conflicts: {}, categories: {} }

export function conflictAction(
  row: ImportPreviewRowDto,
  choices: PreviewChoices,
): ConflictAction {
  return choices.conflicts[row.lineNumber] ?? 'skip'
}

/** New rows, and conflicts the user chose to import. */
export function willImport(
  row: ImportPreviewRowDto,
  choices: PreviewChoices,
): boolean {
  if (row.status === 'new') return true
  return row.status === 'conflict' && conflictAction(row, choices) === 'import'
}

/** The category the row will be stored with (null: uncategorized). */
export function effectiveCategoryId(
  row: ImportPreviewRowDto,
  choices: PreviewChoices,
): string | null {
  return choices.categories[row.lineNumber] ?? row.categoryId
}

/**
 * Commit body: an explicit decision for every conflict, and a category
 * override only for rows that will be imported and whose category changed.
 */
export function buildCommitPayload(
  rows: ImportPreviewRowDto[],
  choices: PreviewChoices,
): CommitImportDto {
  const conflictResolutions = rows
    .filter((row) => row.status === 'conflict')
    .map((row) => ({
      rowIndex: row.index,
      action: conflictAction(row, choices),
    }))
  const categoryOverrides = rows.flatMap((row) => {
    const categoryId = choices.categories[row.lineNumber]
    if (!categoryId || categoryId === row.categoryId) return []
    if (!willImport(row, choices)) return []
    return [{ rowIndex: row.index, categoryId }]
  })
  return { conflictResolutions, categoryOverrides }
}

/** Imported rows that will land in the review queue (no rule, no pick). */
export function countForReview(
  rows: ImportPreviewRowDto[],
  choices: PreviewChoices,
): number {
  return rows.filter(
    (row) =>
      willImport(row, choices) &&
      row.needsReview &&
      choices.categories[row.lineNumber] === undefined,
  ).length
}
