import { BUILDING_DEFINITIONS } from './buildings'
import type { ContentCatalog } from './contentTypes'
import { ADVENTURE_EVENTS } from './events'
import { HERO_DEFINITIONS } from './heroes'
import { EXPEDITION_POLICY_DEFINITIONS } from './policies'
import { REGION_DEFINITIONS } from './regions'
import { TRAIT_DEFINITIONS } from './traits'

export const GAME_CONTENT = {
  heroes: HERO_DEFINITIONS,
  traits: TRAIT_DEFINITIONS,
  regions: REGION_DEFINITIONS,
  events: ADVENTURE_EVENTS,
  buildings: BUILDING_DEFINITIONS,
  policies: EXPEDITION_POLICY_DEFINITIONS,
} as const satisfies ContentCatalog
