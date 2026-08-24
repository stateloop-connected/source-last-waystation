/// <reference types="node" />

import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { GAME_CONTENT } from '../core/content/contentRegistry'
import {
  validateGameContent,
  type ContentValidationIssue,
  type ContentValidationResult,
} from '../core/content/validateContent'

export type ContentValidationCliIo = {
  log: (message: string) => void
  error: (message: string) => void
  validate: () => ContentValidationResult
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

const DEFAULT_IO: ContentValidationCliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  validate: () => validateGameContent(GAME_CONTENT),
}

export function runValidateContentCli(
  args: readonly string[],
  io: ContentValidationCliIo = DEFAULT_IO,
): number {
  if (args.length > 0) {
    io.error(`未知参数：${args.join(' ')}`)
    return 1
  }

  const result = io.validate()
  for (const warning of result.warnings.toSorted(compareIssues)) {
    io.log(formatIssue(warning))
  }
  for (const error of result.errors.toSorted(compareIssues)) {
    io.error(formatIssue(error))
  }

  io.log(result.valid ? 'Content validation passed' : 'Content validation failed')
  io.log(`Heroes: ${GAME_CONTENT.heroes.length}`)
  io.log(`Traits: ${GAME_CONTENT.traits.length}`)
  io.log(`Regions: ${GAME_CONTENT.regions.length}`)
  io.log(`Events: ${GAME_CONTENT.events.length}`)
  io.log(`Warnings: ${result.warnings.length}`)

  return result.valid ? 0 : 1
}

const entryPoint = process.argv[1]
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  process.exitCode = runValidateContentCli(process.argv.slice(2))
}
