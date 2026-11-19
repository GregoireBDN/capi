import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto'

async function errorsOf<T extends object>(
  type: new () => T,
  body: Record<string, unknown>,
) {
  const dto = plainToInstance(type, body)
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
  return errors.map((error) => error.property)
}

describe('category icon (#287)', () => {
  const create = { name: 'Test', kind: 'expense', color: '#2a78d6' }

  it('accepts an allowed icon, or none', async () => {
    expect(
      await errorsOf(CreateCategoryDto, { ...create, icon: 'utensils' }),
    ).toEqual([])
    expect(await errorsOf(CreateCategoryDto, create)).toEqual([])
    expect(await errorsOf(UpdateCategoryDto, { icon: 'car' })).toEqual([])
    expect(await errorsOf(UpdateCategoryDto, { icon: null })).toEqual([])
  })

  it('refuses an icon outside the allow-list', async () => {
    expect(
      await errorsOf(CreateCategoryDto, { ...create, icon: 'skull' }),
    ).toEqual(['icon'])
    expect(await errorsOf(UpdateCategoryDto, { icon: 'Utensils' })).toEqual([
      'icon',
    ])
    expect(await errorsOf(UpdateCategoryDto, { icon: 42 })).toEqual(['icon'])
  })
})
