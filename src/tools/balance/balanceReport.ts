import type { BalanceReport } from './balanceSimulator'

const decimal = (value: number): string => value.toFixed(3)
const percentage = (value: number): string => `${(value * 100).toFixed(2)}%`

export function renderBalanceTerminalSummary(report: BalanceReport): string {
  const { summary } = report
  return [
    'Balance simulation complete',
    `Seed indexes: ${summary.seedStart}-${summary.seedEnd}`,
    `Seed derivation: ${report.configuration.seedDerivation}`,
    `Scenario groups: ${summary.totalScenarios}`,
    `Simulations: ${summary.totalSimulations}`,
    `Onboarding: ${summary.onboardingSimulations}`,
    `Steady-state: ${summary.steadyStateSimulations}`,
    `Events: ${summary.totalEventCount}`,
    `Command failures: ${summary.commandFailureCount}`,
    `Simulation exceptions: ${summary.simulationExceptionCount}`,
    `No candidate events: ${summary.noCandidateEventCount}`,
    `NaN / Infinity: ${summary.nanCount} / ${summary.infinityCount}`,
    `Negative resources: ${summary.negativeResourceCount}`,
    `Invalid hero health: ${summary.invalidHeroHealthCount}`,
    `Unfinished expeditions: ${summary.unfinishedExpeditionCount}`,
    `Loop guards: ${summary.maxLoopGuardCount}`,
    `Non-deterministic comparisons: ${summary.nonDeterministicCount}`,
  ].join('\n')
}

export function renderBalanceMarkdown(report: BalanceReport): string {
  const { summary } = report
  const lines = [
    '# Last Waystation Balance Summary',
    '',
    'This report is deterministic and does not include a generation timestamp.',
    '',
    '## Overall',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Seed index range | ${summary.seedStart}-${summary.seedEnd} |`,
    `| Seed derivation | ${report.configuration.seedDerivation} |`,
    `| Scenario groups | ${summary.totalScenarios} |`,
    `| Total simulations | ${summary.totalSimulations} |`,
    `| Onboarding simulations | ${summary.onboardingSimulations} |`,
    `| Steady-state simulations | ${summary.steadyStateSimulations} |`,
    `| Events processed | ${summary.totalEventCount} |`,
    `| Command failures | ${summary.commandFailureCount} |`,
    `| Simulation exceptions | ${summary.simulationExceptionCount} |`,
    `| No candidate events | ${summary.noCandidateEventCount} |`,
    `| NaN values | ${summary.nanCount} |`,
    `| Infinity values | ${summary.infinityCount} |`,
    `| Negative resources | ${summary.negativeResourceCount} |`,
    `| Invalid hero health | ${summary.invalidHeroHealthCount} |`,
    `| Unfinished expeditions | ${summary.unfinishedExpeditionCount} |`,
    `| Invalid RNG states | ${summary.invalidRngStateCount} |`,
    `| Journal overflows | ${summary.journalOverflowCount} |`,
    `| Loop guards | ${summary.maxLoopGuardCount} |`,
    `| Non-deterministic comparisons | ${summary.nonDeterministicCount} |`,
    '',
    '## Scenario Groups',
    '',
    '| Cohort | Region | Heroes | Policy | Runs | Avg events | Complete | Early return | Wood | Coins | Food | Medicine | Damage | Health floor | First guarantee | Command failures | Exceptions |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const group of report.groups) {
    lines.push(
      `| ${group.cohort} | ${group.regionId} | ${group.heroIds.join(' + ')} | ${group.policy} | ${group.simulationCount} | ${decimal(group.averageProcessedEvents)} | ${percentage(group.fullCompletionRate)} | ${percentage(group.earlyReturnRate)} | ${decimal(group.averageLoot.wood)} | ${decimal(group.averageLoot.coins)} | ${decimal(group.averageLoot.food)} | ${decimal(group.averageLoot.medicine)} | ${decimal(group.averageDamage)} | ${group.minimumHealthFloorCount} | ${percentage(group.firstExpeditionGuaranteeRate)} | ${group.commandFailureCount} | ${group.simulationExceptionCount} |`,
    )
  }

  lines.push('', '## Event Distribution', '')
  for (const group of report.groups) {
    lines.push(
      `### ${group.cohort} / ${group.regionId} / ${group.heroIds.join(' + ')} / ${group.policy}`,
      '',
      '| Event | Count | Share |',
      '| --- | ---: | ---: |',
    )
    for (const event of group.events) {
      lines.push(
        `| ${event.eventId} | ${event.count} | ${percentage(event.rate)} |`,
      )
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}
