import type { CategoryDto } from '../api/types.js'
import { KIND_LABELS } from './labels.js'
import { defineTool } from './tool.js'

export const listCategoriesTool = defineTool({
  name: 'list_categories',
  title: 'Catégories',
  description:
    'Categories by kind (expense, income, transfer) with their slug, as accepted by the category filters of the other tools.',
  inputSchema: {},
  async run({ api }) {
    const categories = await api.get<CategoryDto[]>('/api/categories')
    const lines: string[] = []
    for (const kind of ['expense', 'income', 'transfer'] as const) {
      const ofKind = categories.filter((c) => c.kind === kind)
      if (ofKind.length === 0) continue
      lines.push(
        `${KIND_LABELS[kind]} :`,
        ...ofKind.map(
          (c) => `- ${c.name} (${c.slug})${c.archivedAt ? ' [archivée]' : ''}`,
        ),
        '',
      )
    }
    return lines.join('\n').trim() || 'Aucune catégorie.'
  },
})
