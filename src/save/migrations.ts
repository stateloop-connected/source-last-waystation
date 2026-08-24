import type { HeroRole } from '../core/model/hero'
import type { GameState } from '../core/model/gameState'
import { WATCHTOWER_DEFINITION } from '../core/content/buildings'
import { ADVENTURE_EVENTS } from '../core/content/events'
import { HERO_DEFINITIONS } from '../core/content/heroes'
import { REGION_DEFINITIONS } from '../core/content/regions'
import {
  MAX_SAVE_TIMESTAMP,
  SAVE_SCHEMA_VERSION,
  type SaveFileV1,
  type SaveResult,
} from './saveTypes'

type UnknownRecord = Record<string, unknown>
type HeroState = GameState['heroes'][number]
type ExpeditionState = NonNullable<GameState['activeExpedition']>
type ExpeditionPolicy = ExpeditionState['policy']
type JournalEntry = GameState['journal'][number]

export type SaveContentCatalog = {
  heroes: readonly { id: string; role: HeroRole }[]
  regions: readonly {
    id: string
    eventIds: readonly string[]
    maxEventCount: number
  }[]
  events: readonly { id: string }[]
}

const SAVE_CONTENT_CATALOG: SaveContentCatalog = {
  heroes: HERO_DEFINITIONS,
  regions: REGION_DEFINITIONS,
  events: ADVENTURE_EVENTS,
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

function isTimestamp(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= MAX_SAVE_TIMESTAMP
}

function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] {
  if (!Array.isArray(value)) {
    return false
  }

  for (const item of value) {
    if (!predicate(item)) {
      return false
    }
  }
  return true
}

function isResourceBundle(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonNegativeInteger(value.food) &&
    isNonNegativeInteger(value.medicine) &&
    isNonNegativeInteger(value.wood) &&
    isNonNegativeInteger(value.coins)
  )
}

const HERO_ROLES = new Set(['vanguard', 'scout', 'medic'])
const HERO_STATUSES = new Set(['idle', 'expedition', 'injured'])

function isHeroState(value: unknown): value is HeroState {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.role === 'string' &&
    HERO_ROLES.has(value.role) &&
    isNonNegativeInteger(value.level) &&
    isNonNegativeInteger(value.maxHealth) &&
    isNonNegativeInteger(value.health) &&
    isFiniteNumber(value.power) &&
    isFiniteNumber(value.insight) &&
    isFiniteNumber(value.survival) &&
    typeof value.status === 'string' &&
    HERO_STATUSES.has(value.status)
  )
}

const EXPEDITION_POLICIES = new Set<ExpeditionPolicy>([
  'cautious',
  'explore',
  'greedy',
])
const EXPEDITION_STATUSES = new Set(['active', 'returning', 'completed'])

function isExpeditionState(value: unknown): value is ExpeditionState {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.regionId) &&
    isArrayOf(value.partyHeroIds, isNonEmptyString) &&
    typeof value.policy === 'string' &&
    EXPEDITION_POLICIES.has(value.policy as ExpeditionPolicy) &&
    isInteger(value.seed) &&
    isInteger(value.rngState) &&
    isTimestamp(value.startedAt) &&
    isTimestamp(value.lastProcessedAt) &&
    isTimestamp(value.nextEventAt) &&
    isNonNegativeInteger(value.processedEventCount) &&
    isNonNegativeInteger(value.maxEventCount) &&
    isResourceBundle(value.carriedLoot) &&
    typeof value.status === 'string' &&
    EXPEDITION_STATUSES.has(value.status)
  )
}

const JOURNAL_CATEGORIES = new Set([
  'system',
  'travel',
  'event',
  'combat',
  'reward',
  'warning',
  'return',
])

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.id) &&
    isTimestamp(value.timestamp) &&
    (value.expeditionId === undefined ||
      isNonEmptyString(value.expeditionId)) &&
    typeof value.category === 'string' &&
    JOURNAL_CATEGORIES.has(value.category) &&
    isNonEmptyString(value.title) &&
    typeof value.text === 'string'
  )
}

function isStructurallyValidGameState(value: unknown): value is GameState {
  if (!isRecord(value) || !isRecord(value.station)) {
    return false
  }

  return (
    isNonEmptyString(value.gameVersion) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isTimestamp(value.lastAdvancedAt) &&
    isResourceBundle(value.resources) &&
    isArrayOf(value.heroes, isHeroState) &&
    isNonNegativeInteger(value.station.watchtowerLevel) &&
    (value.activeExpedition === null ||
      isExpeditionState(value.activeExpedition)) &&
    isNonNegativeInteger(value.completedExpeditions) &&
    typeof value.hasClaimedFirstExpeditionReward === 'boolean' &&
    isArrayOf(value.journal, isJournalEntry)
  )
}

export function hasKnownContentReferences(
  game: GameState,
  catalog: SaveContentCatalog = SAVE_CONTENT_CATALOG,
): boolean {
  const definitionsByHeroId = new Map(
    catalog.heroes.map((hero) => [hero.id, hero] as const),
  )
  const heroIds = new Set<string>()

  if (game.heroes.length !== definitionsByHeroId.size) {
    return false
  }
  for (const hero of game.heroes) {
    const definition = definitionsByHeroId.get(hero.id)
    if (
      definition === undefined ||
      definition.role !== hero.role ||
      heroIds.has(hero.id) ||
      hero.level < 1 ||
      hero.maxHealth <= 0 ||
      hero.health > hero.maxHealth ||
      hero.power < 0 ||
      hero.insight < 0 ||
      hero.survival < 0
    ) {
      return false
    }
    heroIds.add(hero.id)
  }

  const expedition = game.activeExpedition
  if (expedition === null) {
    return (
      game.station.watchtowerLevel <= WATCHTOWER_DEFINITION.maxLevel &&
      game.heroes.every((hero) => hero.status !== 'expedition')
    )
  }

  const region = catalog.regions.find(
    (candidate) => candidate.id === expedition.regionId,
  )
  const eventIds = new Set(catalog.events.map((event) => event.id))
  if (
    region === undefined ||
    region.eventIds.length === 0 ||
    region.eventIds.some((eventId) => !eventIds.has(eventId)) ||
    expedition.status !== 'active' ||
    expedition.maxEventCount !== region.maxEventCount ||
    expedition.processedEventCount >= expedition.maxEventCount ||
    game.station.watchtowerLevel > WATCHTOWER_DEFINITION.maxLevel
  ) {
    return false
  }

  const partyIds = new Set(expedition.partyHeroIds)
  if (
    expedition.partyHeroIds.length !== 2 ||
    partyIds.size !== expedition.partyHeroIds.length ||
    expedition.partyHeroIds.some((heroId) => !heroIds.has(heroId))
  ) {
    return false
  }

  return game.heroes.every(
    (hero) =>
      (partyIds.has(hero.id) && hero.status === 'expedition') ||
      (!partyIds.has(hero.id) && hero.status !== 'expedition'),
  )
}

export function isGameState(value: unknown): value is GameState {
  return (
    isStructurallyValidGameState(value) &&
    hasKnownContentReferences(value)
  )
}

function isStructurallyValidSaveFileV1(
  value: unknown,
): value is SaveFileV1 {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === SAVE_SCHEMA_VERSION &&
    isTimestamp(value.savedAt) &&
    isStructurallyValidGameState(value.game)
  )
}

export function isSaveFileV1(value: unknown): value is SaveFileV1 {
  return (
    isStructurallyValidSaveFileV1(value) &&
    hasKnownContentReferences(value.game)
  )
}

function migrateLegacyV1(value: UnknownRecord): UnknownRecord {
  if (
    !isRecord(value.game) ||
    Object.hasOwn(value.game, 'hasClaimedFirstExpeditionReward')
  ) {
    return value
  }

  return {
    ...value,
    game: {
      ...value.game,
      hasClaimedFirstExpeditionReward:
        isNonNegativeInteger(value.game.completedExpeditions) &&
        value.game.completedExpeditions > 0,
    },
  }
}

export function migrateSave(value: unknown): SaveResult<SaveFileV1> {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: 'invalid-structure',
      error: '存档根结构无效。',
    }
  }

  if (!Object.hasOwn(value, 'schemaVersion')) {
    return {
      ok: false,
      code: 'missing-version',
      error: '存档缺少 schemaVersion，无法识别版本。',
    }
  }

  if (value.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'unsupported-version',
      error: `不支持的存档版本：${String(value.schemaVersion)}。`,
    }
  }

  // Early V1 development saves predate the explicit first-reward milestone.
  const migratedValue = migrateLegacyV1(value)

  if (!isStructurallyValidSaveFileV1(migratedValue)) {
    return {
      ok: false,
      code: 'invalid-structure',
      error: '存档内容结构无效或缺少关键字段。',
    }
  }

  if (!hasKnownContentReferences(migratedValue.game)) {
    return {
      ok: false,
      code: 'invalid-reference',
      error: '存档引用了未知内容或包含不一致的游戏状态。',
    }
  }

  // Future schema versions enter through this switch before reaching the codec.
  switch (migratedValue.schemaVersion) {
    case 1:
      return { ok: true, value: migratedValue }
  }
}
