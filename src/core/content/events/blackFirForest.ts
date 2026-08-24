import type {
  AdventureEventDefinition,
  EventPolicyModifier,
} from '../contentTypes'

const CAUTIOUS_TRAVEL: EventPolicyModifier = {
  weightMultiplier: 1.3,
  rewardMultiplier: 0.85,
  damageMultiplier: 0.75,
}
const CAUTIOUS_DISCOVERY: EventPolicyModifier = {
  weightMultiplier: 0.8,
  rewardMultiplier: 0.85,
  damageMultiplier: 0.75,
}
const CAUTIOUS_DANGER: EventPolicyModifier = {
  weightMultiplier: 0.65,
  rewardMultiplier: 0.85,
  damageMultiplier: 0.75,
}
const EXPLORE_TRAVEL: EventPolicyModifier = {
  weightMultiplier: 0.8,
  rewardMultiplier: 1,
  damageMultiplier: 1,
}
const EXPLORE_DISCOVERY: EventPolicyModifier = {
  weightMultiplier: 1.35,
  rewardMultiplier: 1,
  damageMultiplier: 1,
}
const EXPLORE_DANGER: EventPolicyModifier = {
  weightMultiplier: 1,
  rewardMultiplier: 1,
  damageMultiplier: 1,
}
const GREEDY_TRAVEL: EventPolicyModifier = {
  weightMultiplier: 0.65,
  rewardMultiplier: 1.25,
  damageMultiplier: 1.25,
}
const GREEDY_DISCOVERY: EventPolicyModifier = {
  weightMultiplier: 1.2,
  rewardMultiplier: 1.25,
  damageMultiplier: 1.25,
}
const GREEDY_DANGER: EventPolicyModifier = {
  weightMultiplier: 1.55,
  rewardMultiplier: 1.25,
  damageMultiplier: 1.25,
}

const TRAVEL_POLICY_MODIFIERS = {
  cautious: CAUTIOUS_TRAVEL,
  explore: EXPLORE_TRAVEL,
  greedy: GREEDY_TRAVEL,
} as const

const DISCOVERY_POLICY_MODIFIERS = {
  cautious: CAUTIOUS_DISCOVERY,
  explore: EXPLORE_DISCOVERY,
  greedy: GREEDY_DISCOVERY,
} as const

const DANGER_POLICY_MODIFIERS = {
  cautious: CAUTIOUS_DANGER,
  explore: EXPLORE_DANGER,
  greedy: GREEDY_DANGER,
} as const

export const BLACK_FIR_FOREST_EVENTS = [
  {
    id: 'quiet-march',
    title: '平静行进',
    description: '队伍沿着残存的路标稳步前行。',
    regionIds: ['black-fir-forest'],
    tags: ['safe'],
    baseWeight: 16,
    policyModifiers: TRAVEL_POLICY_MODIFIERS,
    resolution: { type: 'effects', effects: [] },
  },
  {
    id: 'fallen-timber',
    title: '发现木材',
    description: '倒伏的黑杉仍有不少干燥木料可以利用。',
    regionIds: ['black-fir-forest'],
    tags: ['reward', 'discovery'],
    baseWeight: 20,
    policyModifiers: DISCOVERY_POLICY_MODIFIERS,
    resolution: {
      type: 'effects',
      effects: [
        {
          type: 'gainLoot',
          resource: 'wood',
          amount: { min: 2, max: 5 },
        },
      ],
    },
  },
  {
    id: 'old-coins',
    title: '发现旧钱币',
    description: '废弃营地的铁盒里留着一小袋旧钱币。',
    regionIds: ['black-fir-forest'],
    tags: ['reward', 'discovery'],
    baseWeight: 12,
    policyModifiers: DISCOVERY_POLICY_MODIFIERS,
    resolution: {
      type: 'effects',
      effects: [
        {
          type: 'gainLoot',
          resource: 'coins',
          amount: { min: 2, max: 5 },
        },
      ],
    },
  },
  {
    id: 'mist-wolf',
    title: '遭遇迷雾狼',
    description: '灰白的兽影从雾中逼近，队伍必须正面应对。',
    regionIds: ['black-fir-forest'],
    tags: ['danger', 'combat'],
    baseWeight: 10,
    policyModifiers: DANGER_POLICY_MODIFIERS,
    resolution: {
      type: 'partyCheck',
      stat: 'power',
      difficulty: 14,
      randomBonus: { min: -3, max: 3 },
      successEffects: [
        {
          type: 'gainLoot',
          resource: 'coins',
          amount: { min: 3, max: 6 },
        },
      ],
      failureEffects: [
        {
          type: 'damageHero',
          target: 'randomPartyMember',
          amount: { min: 12, max: 22 },
        },
      ],
    },
  },
  {
    id: 'medicinal-herbs',
    title: '发现草药',
    description: '林间湿地生长着可以入药的耐寒草叶。',
    regionIds: ['black-fir-forest'],
    tags: ['reward', 'discovery', 'recovery'],
    baseWeight: 13,
    policyModifiers: DISCOVERY_POLICY_MODIFIERS,
    resolution: {
      type: 'effects',
      effects: [
        {
          type: 'gainLoot',
          resource: 'medicine',
          amount: { min: 1, max: 2 },
        },
      ],
    },
  },
  {
    id: 'lost-trail',
    title: '迷路受伤',
    description: '旧路在雾中消失，一名队员在绕行时受了伤。',
    regionIds: ['black-fir-forest'],
    tags: ['danger'],
    baseWeight: 9,
    policyModifiers: DANGER_POLICY_MODIFIERS,
    resolution: {
      type: 'effects',
      effects: [
        {
          type: 'damageHero',
          target: 'randomPartyMember',
          amount: { min: 5, max: 12 },
        },
      ],
    },
  },
] as const satisfies readonly AdventureEventDefinition[]
