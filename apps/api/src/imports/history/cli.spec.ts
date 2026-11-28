import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DrizzleQueryError } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertReportPathAllowed,
  CliUsageError,
  describeError,
  findRepoRoot,
  parseCliArgs,
} from './cli'

describe('parseCliArgs', () => {
  it('defaults to a dry run and resolves paths against the base dir', () => {
    expect(
      parseCliArgs(['--', '--transactions', 'data/tx.csv'], '/repo'),
    ).toEqual({
      transactions: '/repo/data/tx.csv',
      balances: null,
      accounts: null,
      categories: null,
      report: null,
      user: null,
      commit: false,
      createRules: false,
      includeConflicts: false,
    })
  })

  it('reads every option', () => {
    expect(
      parseCliArgs(
        [
          '--transactions',
          '/abs/tx.csv',
          '--balances',
          'b.csv',
          '--accounts',
          'a.json',
          '--categories',
          'c.json',
          '--report',
          'data/r.json',
          '--user',
          'owner@example.test',
          '--commit',
          '--create-rules',
          '--include-conflicts',
        ],
        '/repo',
      ),
    ).toEqual({
      transactions: '/abs/tx.csv',
      balances: '/repo/b.csv',
      accounts: '/repo/a.json',
      categories: '/repo/c.json',
      report: '/repo/data/r.json',
      user: 'owner@example.test',
      commit: true,
      createRules: true,
      includeConflicts: true,
    })
  })

  it('returns null for --help and rejects bad arguments', () => {
    expect(parseCliArgs(['--help'], '/repo')).toBeNull()
    expect(() => parseCliArgs([], '/repo')).toThrow(CliUsageError)
    expect(() =>
      parseCliArgs(['--transactions', 'x.csv', '--dry'], '/repo'),
    ).toThrow(CliUsageError)
    expect(() =>
      parseCliArgs(['--transactions', 'x.csv', 'extra'], '/repo'),
    ).toThrow(CliUsageError)
  })
})

describe('assertReportPathAllowed', () => {
  let root: string
  let outside: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'history-cli-repo-'))
    outside = mkdtempSync(join(tmpdir(), 'history-cli-out-'))
    writeFileSync(join(root, 'pnpm-workspace.yaml'), '')
    mkdirSync(join(root, 'data'))
    mkdirSync(join(root, 'apps', 'api'), { recursive: true })
    symlinkSync(join(root, 'apps'), join(outside, 'link-to-apps'))
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('finds the repository root', () => {
    expect(findRepoRoot(join(root, 'apps', 'api'))).toBe(root)
  })

  it('allows data/ and paths outside the repository', () => {
    expect(() =>
      assertReportPathAllowed(join(root, 'data', 'report.json'), root),
    ).not.toThrow()
    expect(() =>
      assertReportPathAllowed(join(root, 'data', 'new', 'report.json'), root),
    ).not.toThrow()
    expect(() =>
      assertReportPathAllowed(join(outside, 'report.json'), root),
    ).not.toThrow()
    expect(() =>
      assertReportPathAllowed(join(root, 'report.json'), null),
    ).not.toThrow()
  })

  it('refuses other paths inside the repository, symlinks included', () => {
    for (const path of [
      join(root, 'report.json'),
      join(root, 'data'),
      join(root, 'apps', 'api', 'report.json'),
      join(root, 'data', '..', 'report.json'),
      join(outside, 'link-to-apps', 'report.json'),
    ]) {
      expect(() => assertReportPathAllowed(path, root)).toThrow(CliUsageError)
    }
  })
})

describe('describeError', () => {
  it('drops the parameters of failed queries', () => {
    const cause = Object.assign(new Error('duplicate key value'), {
      code: '23505',
    })
    const error = new DrizzleQueryError(
      'insert into "transactions" ...',
      ['SECRET LABEL', -1234],
      cause,
    )
    const message = describeError(error)
    expect(message).toBe('Database error (23505): duplicate key value')
    expect(message).not.toMatch(/SECRET|1234/)
  })

  it('keeps the message of other errors', () => {
    expect(describeError(new Error('No categories found'))).toBe(
      'No categories found',
    )
    expect(describeError('weird')).toBe('Unexpected error')
  })
})
