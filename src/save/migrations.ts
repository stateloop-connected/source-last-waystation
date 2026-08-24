import { WATCHTOWER_DEFINITION } from '../core/content/buildings'
import { ADVENTURE_EVENTS } from '../core/content/events'
import { HERO_DEFINITIONS } from '../core/content/heroes'
import { REGION_DEFINITIONS } from '../core/content/regions'
import type { GameState } from '../core/model/gameState'
import type { HeroRole } from '../core/model/hero'
import { MAX_JOURNAL_ENTRIES } from '../core/simulation/rewards'
import {
  LEGACY_SAVE_SCHEMA_VERSION,
  MAX_SAVE_TIMESTAMP,
  SAVE_SCHEMA_VERSION,
  type GameStateV1,
  type SaveFileV1,
  type SaveFileV2,
  type SaveResult,
} from './saveTypes'

type UnknownRecord = Record<string, unknown>
type HeroState = GameState['heroes'][number]
type ExpeditionState = NonNullable<GameState['activeExpedition']>
type ExpeditionPolicy = ExpeditionState['policy']
type JournalEntry = GameState['journal'][number]

const MAX_PERSISTED_RNG_STATE = 0xffff_ffff

export type SaveContentCatalog = {
  heroes: readonly {
    id: string
    role: HeroRole
    traitIds: readonly string[]
  }[]
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

function isPersistedRngState(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= MAX_PERSISTED_RNG_STATE
}

function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(predicate)
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    isArrayOf(value, isNonEmptyString) && new Set(value).size === value.length
  )
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

function hasHeroBaseFields(value: UnknownRecord): boolean {
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

function isHeroStateV1(
  value: unknown,
): value is GameStateV1['heroes'][number] {
  return isRecord(value) && hasHeroBaseFields(value)
}

function isHeroState(value: unknown): value is HeroState {
  return (
    isRecord(value) &&
    hasHeroBaseFields(value) &&
    isUniqueStringArray(value.traitIds)
  )
}

const EXPEDITION_POLICIES = new Set<ExpeditionPolicy>([
  'cautious',
  'explore',
  'greedy',
])
const EXPEDITION_STATUSES = new Set(['active', 'returning', 'completed'])

function hasExpeditionBaseFields(value: UnknownRecord): boolean {
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.regionId) &&
    isArrayOf(value.partyHeroIds, isNonEmptyString) &&
    typeof value.policy === 'string' &&
    EXPEDITION_POLICIES.has(value.policy as ExpeditionPolicy) &&
    isPersistedRngState(value.seed) &&
    isPersistedRngState(value.rngState) &&
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

function isExpeditionStateV1(
  value: unknown,
): value is NonNullable<GameStateV1['activeExpedition']> {
  return isRecord(value) && hasExpeditionBaseFields(value)
}

function isExpeditionState(value: unknown): value is ExpeditionState {
  return (
    isRecord(value) &&
    hasExpeditionBaseFields(value) &&
    isUniqueStringArray(value.eventFlags)
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
    (value.sourceEventId === undefined ||
      isNonEmptyString(value.sourceEventId)) &&
    typeof value.category === 'string' &&
    JOURNAL_CATEGORIES.has(value.category) &&
    isNonEmptyString(value.title) &&
    typeof value.text === 'string'
  )
}

function hasGameStateBaseFields(value: UnknownRecord): boolean {
  return (
    isNonEmptyString(value.gameVersion) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isTimestamp(value.lastAdvancedAt) &&
    isResourceBundle(value.resources) &&
    isNonNegativeInteger(value.completedExpeditions) &&
    typeof value.hasClaimedFirstExpeditionReward === 'boolean' &&
    isArrayOf(value.journal, isJournalEntry) &&
    value.journal.length <= MAX_JOURNAL_ENTRIES
  )
}

function isStructurallyValidGameStateV1(
  value: unknown,
): value is GameStateV1 {
  if (!isRecord(value) || !isRecord(value.station)) {
    return false
  }

  return (
    hasGameStateBaseFields(value) &&
    isArrayOf(value.heroes, isHeroStateV1) &&
    isNonNegativeInteger(value.station.watchtowerLevel) &&
    (value.activeExpedition === null ||
      isExpeditionStateV1(value.activeExpedition))
  )
}

function isStructurallyValidGameState(value: unknown): value is GameState {
  if (!isRecord(value) || !isRecord(value.station)) {
    return false
  }

  return (
    hasGameStateBaseFields(value) &&
    isUniqueStringArray(value.unlockedRegionIds) &&
    isArrayOf(value.heroes, isHeroState) &&
    isNonNegativeInteger(value.station.watchtowerLevel) &&
    isNonNegativeInteger(value.station.infirmaryLevel) &&
    (value.activeExpedition === null ||
      isExpeditionState(value.activeExpedition))
  )
}

function sameStringSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((item) => expected.includes(item))
  )
}

function hasKnownBaseContentReferences(
  game: GameStateV1 | GameState,
  catalog: SaveContentCatalog,
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
      hero.health < 1 ||
      hero.health > hero.maxHealth ||
      hero.power < 0 ||
      hero.insight < 0 ||
      hero.survival < 0
    ) {
      return false
    }
    heroIds.add(hero.id)
  }

  if (game.station.watchtowerLevel > WATCHTOWER_DEFINITION.maxLevel) {
    return false
  }

  const expedition = game.activeExpedition
  if (expedition === null) {
    return game.heroes.every((hero) => hero.status !== 'expedition')
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
    expedition.processedEventCount >= expedition.maxEventCount
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

function hasKnownV1ContentReferences(
  game: GameStateV1,
  catalog: SaveContentCatalog = SAVE_CONTENT_CATALOG,
): boolean {
  return hasKnownBaseContentReferences(game, catalog)
}

export function hasKnownContentReferences(
  game: GameState,
  catalog: SaveContentCatalog = SAVE_CONTENT_CATALOG,
): boolean {
  if (!hasKnownBaseContentReferences(game, catalog)) {
    return false
  }

  const knownRegionIds = new Set(catalog.regions.map((region) => region.id))
  if (
    game.unlockedRegionIds.length === 0 ||
    game.unlockedRegionIds.some((regionId) => !knownRegionIds.has(regionId)) ||
    game.station.infirmaryLevel !== 0
  ) {
    return false
  }

  for (const hero of game.heroes) {
    const definition = catalog.heroes.find((candidate) => candidate.id === hero.id)
    if (
      definition === undefined ||
      !sameStringSet(hero.traitIds, definition.traitIds)
    ) {
      return false
    }
  }

  return (
    game.activeExpedition === null ||
    game.unlockedRegionIds.includes(game.activeExpedition.regionId)
  )
}

export function isGameState(value: unknown): value is GameState {
  return isStructurallyValidGameState(value) && hasKnownContentReferences(value)
}

function isStructurallyValidSaveFileV1(
  value: unknown,
): value is SaveFileV1 {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LEGACY_SAVE_SCHEMA_VERSION &&
    isTimestamp(value.savedAt) &&
    isStructurallyValidGameStateV1(value.game)
  )
}

function isStructurallyValidSaveFileV2(
  value: unknown,
): value is SaveFileV2 {
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
    hasKnownV1ContentReferences(value.game)
  )
}

export function isSaveFileV2(value: unknown): value is SaveFileV2 {
  return (
    isStructurallyValidSaveFileV2(value) &&
    hasKnownContentReferences(value.game)
  )
}

function migrateEarlyV1(value: UnknownRecord): UnknownRecord {
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

export function migrateSaveV1ToV2(save: SaveFileV1): SaveFileV2 {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: save.savedAt,
    game: {
      ...save.game,
      resources: { ...save.game.resources },
      unlockedRegionIds: ['black-fir-forest'],
      heroes: save.game.heroes.map((hero) => {
        const definition = HERO_DEFINITIONS.find(
          (candidate) => candidate.id === hero.id,
        )

        return {
          ...hero,
          traitIds: definition === undefined ? [] : [...definition.traitIds],
        }
      }),
      station: {
        ...save.game.station,
        infirmaryLevel: 0,
      },
      activeExpedition:
        save.game.activeExpedition === null
          ? null
          : {
              ...save.game.activeExpedition,
              partyHeroIds: [...save.game.activeExpedition.partyHeroIds],
              carriedLoot: { ...save.game.activeExpedition.carriedLoot },
              eventFlags: [],
            },
      journal: save.game.journal.map((entry) => ({ ...entry })),
    },
  }
}

function invalidStructure(): SaveResult<SaveFileV2> {
  return {
    ok: false,
    code: 'invalid-structure',
    error: '存档内容结构无效或缺少关键字段。',
  }
}

function invalidReference(): SaveResult<SaveFileV2> {
  return {
    ok: false,
    code: 'invalid-reference',
    error: '存档引用了未知内容或包含不一致的游戏状态。',
  }
}

export function migrateSave(value: unknown): SaveResult<SaveFileV2> {
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

  if (
    value.schemaVersion !== LEGACY_SAVE_SCHEMA_VERSION &&
    value.schemaVersion !== SAVE_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      code: 'unsupported-version',
      error: `不支持的存档版本：${String(value.schemaVersion)}。`,
    }
  }

  if (value.schemaVersion === LEGACY_SAVE_SCHEMA_VERSION) {
    const legacyValue = migrateEarlyV1(value)
    if (!isStructurallyValidSaveFileV1(legacyValue)) {
      return invalidStructure()
    }
    if (!hasKnownV1ContentReferences(legacyValue.game)) {
      return invalidReference()
    }

    const migrated = migrateSaveV1ToV2(legacyValue)
    if (!isStructurallyValidSaveFileV2(migrated)) {
      return invalidStructure()
    }
    if (!hasKnownContentReferences(migrated.game)) {
      return invalidReference()
    }

    return {
      ok: true,
      value: migrated,
      sourceSchemaVersion: LEGACY_SAVE_SCHEMA_VERSION,
    }
  }

  if (!isStructurallyValidSaveFileV2(value)) {
    return invalidStructure()
  }
  if (!hasKnownContentReferences(value.game)) {
    return invalidReference()
  }

  return {
    ok: true,
    value,
    sourceSchemaVersion: SAVE_SCHEMA_VERSION,
  }
}
