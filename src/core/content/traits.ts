import type { TraitDefinition } from './contentTypes'

// Phase 2A only registers trait metadata. Trait behavior is introduced later.
export const TRAIT_DEFINITIONS = [
  {
    id: 'ronn.guardian',
    name: '守望者',
    description: '总是站在队伍最需要他的地方。',
  },
  {
    id: 'eve.pathfinder',
    name: '寻路者',
    description: '善于辨认荒野中几乎消失的道路。',
  },
  {
    id: 'mia.field-medic',
    name: '战地医师',
    description: '能够在恶劣环境下照料同行者。',
  },
] as const satisfies readonly TraitDefinition[]

export function getTraitDefinition(id: string): TraitDefinition | undefined {
  return TRAIT_DEFINITIONS.find((trait) => trait.id === id)
}
