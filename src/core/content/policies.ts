import type { ExpeditionPolicyDefinition } from './contentTypes'

export const EXPEDITION_POLICY_DEFINITIONS = [
  {
    id: 'cautious',
    name: '谨慎',
    description: '减少危险和伤势；队员重伤时会提前返程。',
    eventWeightMultipliers: {
      travel: 1.3,
      discovery: 0.8,
      danger: 0.65,
    },
    rewardMultiplier: 0.85,
    damageMultiplier: 0.75,
    healthReturnThreshold: 0.3,
  },
  {
    id: 'explore',
    name: '探索',
    description: '均衡推进，并更容易发现沿途资源。',
    eventWeightMultipliers: {
      travel: 0.8,
      discovery: 1.35,
      danger: 1,
    },
    rewardMultiplier: 1,
    damageMultiplier: 1,
    healthReturnThreshold: null,
  },
  {
    id: 'greedy',
    name: '逐利',
    description: '争取更多战利品，但遭遇危险和重伤的可能也更高。',
    eventWeightMultipliers: {
      travel: 0.65,
      discovery: 1.2,
      danger: 1.55,
    },
    rewardMultiplier: 1.25,
    damageMultiplier: 1.25,
    healthReturnThreshold: null,
  },
] as const satisfies readonly ExpeditionPolicyDefinition[]

export function getPolicyDefinition(
  id: string,
): ExpeditionPolicyDefinition | undefined {
  return EXPEDITION_POLICY_DEFINITIONS.find((policy) => policy.id === id)
}
