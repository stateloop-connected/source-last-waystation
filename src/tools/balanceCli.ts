/// <reference types="node" />

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { GAME_CONTENT } from '../core/content/contentRegistry'
import {
  validateGameContent,
  type ContentValidationIssue,
  type ContentValidationResult,
} from '../core/content/validateContent'
import {
  DEFAULT_BALANCE_SEEDS,
  getBalanceCheckFailures,
  runVerifiedBalanceSimulation,
  serializeBalanceReport,
  type BalanceReport,
} from './balance/balanceSimulator'
import {
  renderBalanceMarkdown,
  renderBalanceTerminalSummary,
} from './balance/balanceReport'

export type BalanceCliOptions = {
  seeds: number
  check: boolean
  output?: string
}

export type BalanceCliIo = {
  log: (message: string) => void
  error: (message: string) => void
  validateContent: () => ContentValidationResult
  simulate: (seeds: number) => BalanceReport
  writeReport: (outputDirectory: string, report: BalanceReport) => Promise<void>
}

function requireValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1]
  if (
    value === undefined ||
    value.trim().length === 0 ||
    value.startsWith('--')
  ) {
    throw new Error(`${option} 需要一个值。`)
  }
  return value
}

function parseSeedCount(value: string): number {
  const seeds = Number(value)
  if (!Number.isSafeInteger(seeds) || seeds <= 0) {
    throw new Error('--seeds 必须是有限正整数。')
  }
  return seeds
}

export function parseBalanceCliArguments(
  args: readonly string[],
): BalanceCliOptions {
  let seeds = DEFAULT_BALANCE_SEEDS
  let check = false
  let output: string | undefined
  let sawSeeds = false
  let sawOutput = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--check') {
      if (check) {
        throw new Error('--check 不能重复指定。')
      }
      check = true
      continue
    }
    if (argument === '--seeds') {
      if (sawSeeds) {
        throw new Error('--seeds 不能重复指定。')
      }
      seeds = parseSeedCount(requireValue(args, index, '--seeds'))
      sawSeeds = true
      index += 1
      continue
    }
    if (argument?.startsWith('--seeds=')) {
      if (sawSeeds) {
        throw new Error('--seeds 不能重复指定。')
      }
      seeds = parseSeedCount(argument.slice('--seeds='.length))
      sawSeeds = true
      continue
    }
    if (argument === '--output') {
      if (sawOutput) {
        throw new Error('--output 不能重复指定。')
      }
      output = requireValue(args, index, '--output')
      sawOutput = true
      index += 1
      continue
    }
    if (argument?.startsWith('--output=')) {
      if (sawOutput) {
        throw new Error('--output 不能重复指定。')
      }
      output = argument.slice('--output='.length)
      if (output.trim().length === 0) {
        throw new Error('--output 需要一个值。')
      }
      sawOutput = true
      continue
    }
    throw new Error(`未知参数：${argument ?? ''}`)
  }

  return output === undefined
    ? { seeds, check }
    : { seeds, check, output }
}

function compareIssues(
  left: ContentValidationIssue,
  right: ContentValidationIssue,
): number {
  const compareText = (first: string, second: string): number =>
    first < second ? -1 : first > second ? 1 : 0
  return (
    compareText(left.code, right.code) ||
    compareText(left.contentId ?? '', right.contentId ?? '') ||
    compareText(left.message, right.message)
  )
}

function formatIssue(issue: ContentValidationIssue): string {
  const content =
    issue.contentId === undefined ? '' : ` (${issue.contentId})`
  return `[${issue.severity}] ${issue.code}${content}: ${issue.message}`
}

export async function writeBalanceReport(
  outputDirectory: string,
  report: BalanceReport,
): Promise<void> {
  const directory = resolve(outputDirectory)
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(directory, 'balance-summary.json'),
      serializeBalanceReport(report),
      'utf8',
    ),
    writeFile(
      resolve(directory, 'balance-summary.md'),
      renderBalanceMarkdown(report),
      'utf8',
    ),
  ])
}

const DEFAULT_IO: BalanceCliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  validateContent: () => validateGameContent(GAME_CONTENT),
  simulate: (seeds) => runVerifiedBalanceSimulation({ seeds }),
  writeReport: writeBalanceReport,
}

export async function runBalanceCli(
  args: readonly string[],
  io: BalanceCliIo = DEFAULT_IO,
): Promise<number> {
  let options: BalanceCliOptions
  try {
    options = parseBalanceCliArguments(args)
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  const validation = io.validateContent()
  for (const warning of validation.warnings.toSorted(compareIssues)) {
    io.log(formatIssue(warning))
  }
  if (!validation.valid) {
    for (const error of validation.errors.toSorted(compareIssues)) {
      io.error(formatIssue(error))
    }
    return 1
  }

  try {
    const report = io.simulate(options.seeds)
    io.log(renderBalanceTerminalSummary(report))

    if (!options.check && options.output !== undefined) {
      await io.writeReport(options.output, report)
      io.log(
        `Reports: ${resolve(options.output, 'balance-summary.json')} and ${resolve(options.output, 'balance-summary.md')}`,
      )
    }

    const failures = getBalanceCheckFailures(report)
    if (failures.length > 0) {
      for (const failure of failures) {
        io.error(`Balance invariant: ${failure}`)
      }
      return options.check ? 1 : 0
    }
    return 0
  } catch (error) {
    io.error(
      `Balance simulation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}

const entryPoint = process.argv[1]
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  process.exitCode = await runBalanceCli(process.argv.slice(2))
}
