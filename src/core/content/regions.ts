import type { RegionDefinition } from './contentTypes'

export const EVENT_INTERVAL_MS = 15_000
export const MAX_EXPEDITION_EVENTS = 6

export const REGION_DEFINITIONS = [
  {
    id: 'black-fir-forest',
    name: '黑杉林',
    description: '雾气终年不散的旧林地，仍能找到边境站急需的补给。',
    eventIds: [
      'quiet-march',
      'fallen-timber',
      'old-coins',
      'mist-wolf',
      'medicinal-herbs',
      'lost-trail',
    ],
    eventIntervalMs: EVENT_INTERVAL_MS,
    maxEventCount: MAX_EXPEDITION_EVENTS,
  },
] as const satisfies readonly RegionDefinition[]

export function getRegionDefinition(id: string): RegionDefinition | undefined {
  return REGION_DEFINITIONS.find((region) => region.id === id)
}
