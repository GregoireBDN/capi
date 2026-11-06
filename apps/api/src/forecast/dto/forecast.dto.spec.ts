import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { ForecastQueryDto } from './forecast.dto'

const A = 'a1b2c3d4-0000-4000-8000-000000000001'
const B = 'a1b2c3d4-0000-4000-8000-000000000002'

async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ForecastQueryDto, query)
  return { dto, errors: await validate(dto, { forbidNonWhitelisted: true }) }
}

describe('ForecastQueryDto', () => {
  it('reads comma-separated or repeated account ids', async () => {
    expect((await parse({ accountIds: `${A}, ${B}` })).dto.accountIds).toEqual([
      A,
      B,
    ])
    expect((await parse({ accountIds: [A, B] })).dto.accountIds).toEqual([A, B])
    expect((await parse({ accountIds: 'nope' })).errors).toHaveLength(1)
  })

  it('reads a signed threshold in cents and the variable toggle', async () => {
    const { dto, errors } = await parse({
      threshold: '-15000',
      includeVariable: 'false',
    })
    expect(errors).toEqual([])
    expect(dto).toMatchObject({ threshold: -15_000, includeVariable: false })
    expect((await parse({ threshold: '12.5' })).errors).toHaveLength(1)
    expect((await parse({ includeVariable: 'yes' })).errors).toHaveLength(1)
  })
})
