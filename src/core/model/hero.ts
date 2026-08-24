export const HERO_ROLES = ['vanguard', 'scout', 'medic'] as const

export type HeroRole = (typeof HERO_ROLES)[number]

export const HERO_STATUSES = ['idle', 'expedition', 'injured'] as const

export type HeroStatus = (typeof HERO_STATUSES)[number]

export type HeroState = {
  id: string
  name: string
  role: HeroRole
  level: number
  maxHealth: number
  health: number
  power: number
  insight: number
  survival: number
  status: HeroStatus
}
