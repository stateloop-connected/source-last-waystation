export const EXPEDITION_POLICIES = ['cautious', 'explore', 'greedy'] as const

export type ExpeditionPolicy = (typeof EXPEDITION_POLICIES)[number]

export const EXPEDITION_STATUSES = [
  'active',
  'returning',
  'completed',
] as const

export type ExpeditionStatus = (typeof EXPEDITION_STATUSES)[number]

export type ExpeditionLoot = {
  wood: number
  coins: number
  food: number
  medicine: number
}

export type ExpeditionState = {
  id: string
  regionId: string
  partyHeroIds: string[]
  policy: ExpeditionPolicy
  seed: number
  rngState: number
  startedAt: number
  lastProcessedAt: number
  nextEventAt: number
  processedEventCount: number
  maxEventCount: number
  carriedLoot: ExpeditionLoot
  eventFlags: string[]
  status: ExpeditionStatus
}
