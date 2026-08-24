/// <reference types="node" />

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { GAME_CONTENT } from '../core/content/contentRegistry'
import { validateGameContent } from '../core/content/validateContent'
import {
  runBalanceSimulation,
  type BalanceReport,
} from './balance/balanceSimulator'
import {
  parseBalanceCliArguments,
  runBalanceCli,
  writeBalanceReport,
  type BalanceCliIo,
} from './balanceCli'

function createIo(
  report: BalanceReport = runBalanceSimulation({ seeds: 1 }),
): BalanceCliIo {
  return {
    log: vi.fn(),
    error: vi.fn(),
    validateContent: () => validateGameContent(GAME_CONTENT),
    simulate: vi.fn(() => report),
    writeReport: vi.fn(() => Promise.resolve()),
  }
}

describe('balance CLI arguments', () => {
  it('parses supported options', () => {
    expect(
      parseBalanceCliArguments([
        '--seeds',
        '25',
        '--check',
        '--output=artifacts/balance-test',
      ]),
    ).toEqual({
      seeds: 25,
      check: true,
      output: 'artifacts/balance-test',
    })
  })

  it.each([
    ['--seeds', '0'],
    ['--seeds', '1.5'],
    ['--seeds'],
    ['--output'],
    ['--output', ''],
    ['--output=   '],
    ['--unknown'],
  ])('rejects invalid arguments: %s', (...args) => {
    expect(() => parseBalanceCliArguments(args)).toThrow()
  })
})

describe('balance CLI execution', () => {
  it('does not write files in check mode even with an output argument', async () => {
    const io = createIo()

    const exitCode = await runBalanceCli(
      ['--seeds', '1', '--check', '--output', 'ignored'],
      io,
    )

    expect(exitCode).toBe(0)
    expect(io.writeReport).not.toHaveBeenCalled()
  })

  it('returns exit code 1 for invalid seed arguments', async () => {
    const io = createIo()

    const exitCode = await runBalanceCli(['--seeds', 'NaN'], io)

    expect(exitCode).toBe(1)
    expect(io.simulate).not.toHaveBeenCalled()
  })

  it('returns exit code 1 when a check invariant fails', async () => {
    const report = runBalanceSimulation({ seeds: 1 })
    report.summary.nonDeterministicCount = 1
    const io = createIo(report)

    expect(await runBalanceCli(['--check', '--seeds', '1'], io)).toBe(1)
    expect(io.error).toHaveBeenCalledWith(
      expect.stringContaining('结果不确定'),
    )
  })

  it('writes parseable JSON and non-empty Markdown reports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'last-waystation-balance-'))
    try {
      const report = runBalanceSimulation({ seeds: 1 })
      await writeBalanceReport(directory, report)

      const json = await readFile(
        join(directory, 'balance-summary.json'),
        'utf8',
      )
      const markdown = await readFile(
        join(directory, 'balance-summary.md'),
        'utf8',
      )
      expect(JSON.parse(json)).toEqual(report)
      expect(markdown.length).toBeGreaterThan(100)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
