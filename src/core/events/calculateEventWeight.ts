import type {
  AdventureEventDefinition,
  EventPolicyModifier,
} from '../content/contentTypes'
import type { ExpeditionPolicy } from '../model/expedition'

export type ResolvedEventPolicyModifier = Required<EventPolicyModifier>

const DEFAULT_MODIFIER: ResolvedEventPolicyModifier = {
  weightMultiplier: 1,
  rewardMultiplier: 1,
  damageMultiplier: 1,
}

function safeMultiplier(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) || value < 0
    ? 0
    : value
}

export function getEventPolicyModifier(
  event: AdventureEventDefinition,
  policy: ExpeditionPolicy,
): ResolvedEventPolicyModifier {
  const modifier = event.policyModifiers?.[policy]
  if (modifier === undefined) {
    return DEFAULT_MODIFIER
  }

  return {
    weightMultiplier:
      modifier.weightMultiplier === undefined
        ? 1
        : safeMultiplier(modifier.weightMultiplier),
    rewardMultiplier:
      modifier.rewardMultiplier === undefined
        ? 1
        : safeMultiplier(modifier.rewardMultiplier),
    damageMultiplier:
      modifier.damageMultiplier === undefined
        ? 1
        : safeMultiplier(modifier.damageMultiplier),
  }
}

export function calculateEventWeight(
  event: AdventureEventDefinition,
  policy: ExpeditionPolicy,
): number {
  if (!Number.isFinite(event.baseWeight) || event.baseWeight <= 0) {
    return 0
  }

  const weight =
    event.baseWeight * getEventPolicyModifier(event, policy).weightMultiplier
  return Number.isFinite(weight) && weight > 0 ? weight : 0
}
