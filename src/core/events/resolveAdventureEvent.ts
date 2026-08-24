import type {
  AdventureEventDefinition,
  EventPolicyModifier,
} from '../content/contentTypes'
import { randomInt } from '../rng/seededRng'
import {
  applyEventEffects,
  type EventEffectContext,
  type EventEffectResult,
} from './applyEventEffects'

export type AdventureEventResolutionResult = EventEffectResult & {
  checkSucceeded: boolean | null
}

function rollCheckBonus(
  state: number,
  min: number,
  max: number,
): { value: number; nextRngState: number } {
  if (min === max) {
    return { value: min, nextRngState: state }
  }
  const roll = randomInt(state, min, max)
  return { value: roll.value, nextRngState: roll.nextState }
}

function withRngState(
  context: EventEffectContext,
  rngState: number,
): EventEffectContext {
  return { ...context, rngState }
}

export function resolveAdventureEvent(
  event: AdventureEventDefinition,
  context: EventEffectContext,
): AdventureEventResolutionResult {
  const resolution = event.resolution
  if (resolution.type === 'effects') {
    return {
      ...applyEventEffects(resolution.effects, context),
      checkSucceeded: null,
    }
  }

  const bonus = rollCheckBonus(
    context.rngState,
    resolution.randomBonus.min,
    resolution.randomBonus.max,
  )
  const partyScore = context.heroes
    .filter((hero) => context.partyHeroIds.includes(hero.id))
    .reduce((sum, hero) => sum + hero[resolution.stat], 0)
  const succeeded = partyScore + bonus.value >= resolution.difficulty
  const effects = succeeded
    ? resolution.successEffects
    : resolution.failureEffects
  const result = applyEventEffects(
    effects,
    withRngState(context, bonus.nextRngState),
  )

  return {
    ...result,
    messages: [
      succeeded ? '能力检定成功。' : '能力检定失败。',
      ...result.messages,
    ],
    checkSucceeded: succeeded,
  }
}

export type { EventPolicyModifier }
