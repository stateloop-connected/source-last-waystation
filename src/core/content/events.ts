import type { AdventureEventDefinition } from './contentTypes'

export const ADVENTURE_EVENTS = [
  {
    id: 'quiet-march',
    title: '平静行进',
    text: '队伍沿着残存的路标稳步前行。',
    weight: 16,
    tag: 'travel',
    effects: [],
  },
  {
    id: 'fallen-timber',
    title: '发现木材',
    text: '倒伏的黑杉仍有不少干燥木料可以利用。',
    weight: 20,
    tag: 'discovery',
    effects: [{ type: 'gainLoot', resource: 'wood', min: 2, max: 5 }],
  },
  {
    id: 'old-coins',
    title: '发现旧钱币',
    text: '废弃营地的铁盒里留着一小袋旧钱币。',
    weight: 12,
    tag: 'discovery',
    effects: [{ type: 'gainLoot', resource: 'coins', min: 2, max: 5 }],
  },
  {
    id: 'mist-wolf',
    title: '遭遇迷雾狼',
    text: '灰白的兽影从雾中逼近，队伍必须正面应对。',
    weight: 10,
    tag: 'danger',
    effects: [
      {
        type: 'abilityCheck',
        ability: 'power',
        difficulty: 14,
        successEffects: [
          { type: 'gainLoot', resource: 'coins', min: 3, max: 6 },
        ],
        failureEffects: [{ type: 'damageRandomHero', min: 12, max: 22 }],
      },
    ],
  },
  {
    id: 'medicinal-herbs',
    title: '发现草药',
    text: '林间湿地生长着可以入药的耐寒草叶。',
    weight: 13,
    tag: 'discovery',
    effects: [{ type: 'gainLoot', resource: 'medicine', min: 1, max: 2 }],
  },
  {
    id: 'lost-trail',
    title: '迷路受伤',
    text: '旧路在雾中消失，一名队员在绕行时受了伤。',
    weight: 9,
    tag: 'danger',
    effects: [{ type: 'damageRandomHero', min: 5, max: 12 }],
  },
] as const satisfies readonly AdventureEventDefinition[]

export function getAdventureEvent(
  id: string,
): AdventureEventDefinition | undefined {
  return ADVENTURE_EVENTS.find((event) => event.id === id)
}
