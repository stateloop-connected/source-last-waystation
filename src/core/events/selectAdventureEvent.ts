import type { AdventureEventDefinition } from '../content/contentTypes'
import { weightedChoice } from '../rng/seededRng'
import { calculateEventWeight } from './calculateEventWeight'
import {
  evaluateEventConditions,
  type EventConditionContext,
} from './evaluateEventConditions'

export type EventSelectionResult =
  | {
      event: AdventureEventDefinition
      nextRngState: number
      candidateCount: number
      eligibleEventCount: number
      fallbackReason: null
    }
  | {
      event: null
      nextRngState: number
      candidateCount: 0
      eligibleEventCount: number
      fallbackReason: 'no-eligible-events' | 'no-positive-weight-events'
    }

// Filtering consumes no random values. A successful weighted selection always
// consumes exactly one value, including when only one candidate remains.
export function selectAdventureEvent(
  events: readonly AdventureEventDefinition[],
  context: EventConditionContext,
  rngState: number,
): EventSelectionResult {
  const eligible = events.filter(
    (event) =>
      event.regionIds.includes(context.regionId) &&
      evaluateEventConditions(event.conditions, context),
  )
  const candidates = eligible
    .map((event) => ({
      value: event,
      weight: calculateEventWeight(event, context.policy),
    }))
    .filter((candidate) => candidate.weight > 0)

  if (candidates.length === 0) {
    return {
      event: null,
      nextRngState: rngState,
      candidateCount: 0,
      eligibleEventCount: eligible.length,
      fallbackReason:
        eligible.length === 0
          ? 'no-eligible-events'
          : 'no-positive-weight-events',
    }
  }

  const selected = weightedChoice(rngState, candidates)
  return {
    event: selected.value,
    nextRngState: selected.nextState,
    candidateCount: candidates.length,
    eligibleEventCount: eligible.length,
    fallbackReason: null,
  }
}
