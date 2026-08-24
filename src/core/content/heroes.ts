import type { HeroDefinition } from './contentTypes'

export const HERO_DEFINITIONS = [
  {
    id: 'ron',
    name: '罗恩',
    role: 'vanguard',
    level: 1,
    maxHealth: 120,
    power: 9,
    insight: 4,
    survival: 5,
  },
  {
    id: 'eve',
    name: '伊芙',
    role: 'scout',
    level: 1,
    maxHealth: 90,
    power: 4,
    insight: 9,
    survival: 8,
  },
  {
    id: 'mia',
    name: '米娅',
    role: 'medic',
    level: 1,
    maxHealth: 100,
    power: 3,
    insight: 7,
    survival: 9,
  },
] as const satisfies readonly HeroDefinition[]

export function getHeroDefinition(id: string): HeroDefinition | undefined {
  return HERO_DEFINITIONS.find((hero) => hero.id === id)
}
