import {
  EXPEDITION_POLICIES,
  type ExpeditionPolicy,
} from '../model/expedition'
import { HERO_ROLES, type HeroState } from '../model/hero'
import { JOURNAL_CATEGORIES } from '../model/journal'
import { calculateEventWeight } from '../events/calculateEventWeight'
import {
  evaluateEventConditions,
  type EventConditionContext,
} from '../events/evaluateEventConditions'
import { GAME_CONTENT } from './contentRegistry'
import type {
  AdventureEventDefinition,
  ContentCatalog,
  EventCondition,
  EventEffect,
  EventPolicyModifier,
  EventResolution,
  EventTag,
  HeroTarget,
  NumericRange,
} from './contentTypes'
import { EVENT_TAGS, RESOURCE_TYPES } from './contentTypes'
import { RESERVED_ADVENTURE_EVENT_TITLES } from './contentDiagnostics'

export type ContentValidationIssue = {
  severity: 'error' | 'warning'
  code: string
  contentId?: string
  message: string
}

export type ContentValidationResult = {
  valid: boolean
  errors: ContentValidationIssue[]
  warnings: ContentValidationIssue[]
}

const HERO_TARGETS = new Set<string>([
  'randomPartyMember',
  'lowestHealth',
  'highestHealth',
  'lowestPower',
  'highestPower',
])
const FLAG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const CONTENT_ID_PATTERN = FLAG_PATTERN
type UnknownRecord = Record<string, unknown>

function issue(
  code: string,
  message: string,
  contentId?: string,
): ContentValidationIssue {
  return contentId === undefined
    ? { severity: 'error', code, message }
    : { severity: 'error', code, contentId, message }
}

function compareIssues(
  left: ContentValidationIssue,
  right: ContentValidationIssue,
): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.contentId ?? '').localeCompare(right.contentId ?? '') ||
    left.message.localeCompare(right.message)
  )
}

function collectDuplicateIds(
  kind: string,
  values: readonly { id: string }[],
): ContentValidationIssue[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value.id)) {
      duplicates.add(value.id)
    }
    seen.add(value.id)
  }
  return [...duplicates].map((id) =>
    issue(`duplicate-${kind}-id`, `${kind} ID 重复：${id}`, id),
  )
}

function describeUnknown(value: unknown): string {
  try {
    return String(value)
  } catch {
    return `<无法格式化的 ${typeof value}>`
  }
}

function isArrayElementKey(key: string, length: number): boolean {
  const index = Number(key)
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  )
}

function validateSerializable(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  errors: ContentValidationIssue[],
): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    errors.push(issue('non-finite-content-value', `${path} 不是有限数。`))
    return
  }
  if (value === undefined) {
    errors.push(issue('undefined-content-value', `${path} 不得为 undefined。`))
    return
  }
  if (
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    errors.push(
      issue(
        'non-serializable-content-value',
        `${path} 包含不可序列化的 ${typeof value}。`,
      ),
    )
    return
  }
  if (value === null || typeof value !== 'object') {
    return
  }
  if (ancestors.has(value)) {
    errors.push(issue('cyclic-content-value', `${path} 包含循环引用。`))
    return
  }

  if (Array.isArray(value)) {
    const elementCount = Object.getOwnPropertyNames(value).filter((key) =>
      isArrayElementKey(key, value.length),
    ).length
    if (elementCount !== value.length) {
      errors.push(
        issue('sparse-content-array', `${path} 不得包含稀疏数组空位。`),
      )
    }
  }

  const prototype = Object.getPrototypeOf(value) as object | null
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    errors.push(
      issue('non-plain-content-object', `${path} 必须是普通对象或数组。`),
    )
    return
  }

  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) {
    validateSerializable(child, `${path}.${key}`, ancestors, errors)
  }
  ancestors.delete(value)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownFields(
  value: UnknownRecord,
  allowedFields: readonly string[],
  code: string,
  path: string,
  contentId: string,
  errors: ContentValidationIssue[],
): void {
  const allowed = new Set(allowedFields)
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(
        issue(code, `${path} 包含未知字段：${field}`, contentId),
      )
    }
  }
}

function isStringMember<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return (
    typeof value === 'string' &&
    (values as readonly string[]).includes(value)
  )
}

function isExpeditionPolicy(value: unknown): value is ExpeditionPolicy {
  return isStringMember(EXPEDITION_POLICIES, value)
}

function isEventTag(value: unknown): value is EventTag {
  return isStringMember(EVENT_TAGS, value)
}

function isHeroRole(
  value: unknown,
): value is (typeof HERO_ROLES)[number] {
  return isStringMember(HERO_ROLES, value)
}

function isResourceType(
  value: unknown,
): value is (typeof RESOURCE_TYPES)[number] {
  return isStringMember(RESOURCE_TYPES, value)
}

function isJournalCategory(
  value: unknown,
): value is (typeof JOURNAL_CATEGORIES)[number] {
  return isStringMember(JOURNAL_CATEGORIES, value)
}

function isHeroTarget(value: unknown): value is HeroTarget {
  return typeof value === 'string' && HERO_TARGETS.has(value)
}

function requireArrayField(
  value: UnknownRecord,
  field: string,
  path: string,
  contentId: string | undefined,
  errors: ContentValidationIssue[],
): readonly unknown[] {
  const fieldValue = value[field]
  if (!Array.isArray(fieldValue)) {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.${field} 必须是数组。`,
        contentId,
      ),
    )
    return []
  }
  return fieldValue
}

function requireStringField(
  value: UnknownRecord,
  field: string,
  path: string,
  contentId: string | undefined,
  errors: ContentValidationIssue[],
): string {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'string') {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.${field} 必须是字符串。`,
        contentId,
      ),
    )
    return ''
  }
  return fieldValue
}

function requireNumberField(
  value: UnknownRecord,
  field: string,
  path: string,
  contentId: string | undefined,
  errors: ContentValidationIssue[],
): number {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'number') {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.${field} 必须是数值。`,
        contentId,
      ),
    )
    return Number.NaN
  }
  return fieldValue
}

function optionalNumberField(
  value: UnknownRecord,
  field: string,
  path: string,
  contentId: string,
  errors: ContentValidationIssue[],
): number | undefined {
  if (!Object.hasOwn(value, field)) {
    return undefined
  }
  return requireNumberField(value, field, path, contentId, errors)
}

function readStringArray(
  value: UnknownRecord,
  field: string,
  path: string,
  contentId: string | undefined,
  errors: ContentValidationIssue[],
): string[] {
  const items = requireArrayField(value, field, path, contentId, errors)
  const strings: string[] = []
  for (const [index, item] of items.entries()) {
    if (typeof item !== 'string') {
      errors.push(
        issue(
          'invalid-content-structure',
          `${path}.${field}[${index}] 必须是字符串。`,
          contentId,
        ),
      )
    } else {
      strings.push(item)
    }
  }
  return strings
}

function sanitizeRange(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): NumericRange | null {
  if (!isRecord(value)) {
    errors.push(
      issue(
        'invalid-effect-range-structure',
        `${path} 必须包含数值 min 和 max。`,
        eventId,
      ),
    )
    return null
  }
  return {
    min: requireNumberField(value, 'min', path, eventId, errors),
    max: requireNumberField(value, 'max', path, eventId, errors),
  }
}

function sanitizeCondition(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): EventCondition | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    errors.push(
      issue(
        'invalid-event-condition-structure',
        `${path} 必须是带有 type 的条件对象。`,
        eventId,
      ),
    )
    return null
  }

  switch (value.type) {
    case 'regionIs':
      rejectUnknownFields(
        value,
        ['type', 'regionId'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        regionId: requireStringField(value, 'regionId', path, eventId, errors),
      }
    case 'policyIs': {
      rejectUnknownFields(
        value,
        ['type', 'policy'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      if (!isExpeditionPolicy(value.policy)) {
        errors.push(
          issue(
            'unknown-condition-policy',
            `${path}.policy 引用了未知方针：${describeUnknown(value.policy)}`,
            eventId,
          ),
        )
        return null
      }
      return { type: value.type, policy: value.policy }
    }
    case 'partyHasRole': {
      rejectUnknownFields(
        value,
        ['type', 'role', 'minimum'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      if (!isHeroRole(value.role)) {
        errors.push(
          issue(
            'unknown-condition-role',
            `${path}.role 引用了未知职业：${describeUnknown(value.role)}`,
            eventId,
          ),
        )
        return null
      }
      const minimum = optionalNumberField(
        value,
        'minimum',
        path,
        eventId,
        errors,
      )
      return minimum === undefined
        ? { type: value.type, role: value.role }
        : { type: value.type, role: value.role, minimum }
    }
    case 'partyHasHero':
      rejectUnknownFields(
        value,
        ['type', 'heroId'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        heroId: requireStringField(value, 'heroId', path, eventId, errors),
      }
    case 'partyHasTrait':
      rejectUnknownFields(
        value,
        ['type', 'traitId'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        traitId: requireStringField(value, 'traitId', path, eventId, errors),
      }
    case 'minimumPartyHealthRatioAtMost':
    case 'minimumPartyHealthRatioAtLeast':
      rejectUnknownFields(
        value,
        ['type', 'ratio'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        ratio: requireNumberField(value, 'ratio', path, eventId, errors),
      }
    case 'eventIndexBetween': {
      rejectUnknownFields(
        value,
        ['type', 'minimum', 'maximum'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      const minimum = optionalNumberField(
        value,
        'minimum',
        path,
        eventId,
        errors,
      )
      const maximum = optionalNumberField(
        value,
        'maximum',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum }),
      }
    }
    case 'lootAtLeast': {
      rejectUnknownFields(
        value,
        ['type', 'resource', 'amount'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      if (!isResourceType(value.resource)) {
        errors.push(
          issue(
            'unknown-condition-resource',
            `${path}.resource 引用了未知资源：${describeUnknown(value.resource)}`,
            eventId,
          ),
        )
        return null
      }
      return {
        type: value.type,
        resource: value.resource,
        amount: requireNumberField(value, 'amount', path, eventId, errors),
      }
    }
    case 'expeditionFlagPresent':
    case 'expeditionFlagAbsent':
      rejectUnknownFields(
        value,
        ['type', 'flag'],
        'unknown-event-condition-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        flag: requireStringField(value, 'flag', path, eventId, errors),
      }
    default:
      errors.push(
        issue(
          'unknown-event-condition',
          `${path} 包含未知条件：${value.type}`,
          eventId,
        ),
      )
      return null
  }
}

function sanitizeConditions(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): EventCondition[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    errors.push(
      issue(
        'invalid-event-conditions-structure',
        `${path} 必须是条件数组。`,
        eventId,
      ),
    )
    return []
  }
  return value
    .map((condition, index) =>
      sanitizeCondition(condition, `${path}[${index}]`, eventId, errors),
    )
    .filter((condition) => condition !== null)
}

function sanitizeEffect(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): EventEffect | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    errors.push(
      issue(
        'invalid-event-effect-structure',
        `${path} 必须是带有 type 的效果对象。`,
        eventId,
      ),
    )
    return null
  }

  switch (value.type) {
    case 'gainLoot':
    case 'loseLoot': {
      rejectUnknownFields(
        value,
        ['type', 'resource', 'amount'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      const amount = sanitizeRange(value.amount, `${path}.amount`, eventId, errors)
      const resource = value.resource
      if (!isResourceType(resource)) {
        errors.push(
          issue(
            'unknown-effect-resource',
            `${path}.resource 引用了未知资源：${describeUnknown(resource)}`,
            eventId,
          ),
        )
      }
      if (amount === null) {
        return null
      }
      return {
        type: value.type,
        resource: isResourceType(resource) ? resource : 'wood',
        amount,
      }
    }
    case 'damageHero':
    case 'healHero': {
      rejectUnknownFields(
        value,
        value.type === 'damageHero'
          ? ['type', 'target', 'amount', 'minimumHealth']
          : ['type', 'target', 'amount'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      const amount = sanitizeRange(value.amount, `${path}.amount`, eventId, errors)
      const target = value.target
      if (!isHeroTarget(target)) {
        errors.push(
          issue(
            'unknown-hero-target',
            `${path}.target 引用了未知英雄目标：${describeUnknown(target)}`,
            eventId,
          ),
        )
      }
      if (amount === null) {
        return null
      }
      const sanitizedTarget = isHeroTarget(target)
        ? target
        : 'randomPartyMember'
      if (value.type === 'healHero') {
        return { type: value.type, target: sanitizedTarget, amount }
      }
      const minimumHealth = optionalNumberField(
        value,
        'minimumHealth',
        path,
        eventId,
        errors,
      )
      return minimumHealth === undefined
        ? { type: value.type, target: sanitizedTarget, amount }
        : { type: value.type, target: sanitizedTarget, amount, minimumHealth }
    }
    case 'appendJournal': {
      rejectUnknownFields(
        value,
        ['type', 'category', 'title', 'text'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      const category = value.category
      if (!isJournalCategory(category)) {
        errors.push(
          issue(
            'unknown-journal-category',
            `${path}.category 引用了未知日志类别：${describeUnknown(category)}`,
            eventId,
          ),
        )
      }
      return {
        type: value.type,
        category: isJournalCategory(category) ? category : 'event',
        title: requireStringField(value, 'title', path, eventId, errors),
        text: requireStringField(value, 'text', path, eventId, errors),
      }
    }
    case 'setExpeditionFlag':
    case 'clearExpeditionFlag':
      rejectUnknownFields(
        value,
        ['type', 'flag'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        flag: requireStringField(value, 'flag', path, eventId, errors),
      }
    case 'adjustNextEventDelay':
      rejectUnknownFields(
        value,
        ['type', 'seconds'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        seconds: requireNumberField(value, 'seconds', path, eventId, errors),
      }
    case 'requestReturn':
      rejectUnknownFields(
        value,
        ['type', 'reason'],
        'unknown-event-effect-field',
        path,
        eventId,
        errors,
      )
      return {
        type: value.type,
        reason: requireStringField(value, 'reason', path, eventId, errors),
      }
    default:
      errors.push(
        issue(
          'unknown-event-effect',
          `${path} 包含未知效果：${value.type}`,
          eventId,
        ),
      )
      return null
  }
}

function sanitizeEffects(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): EventEffect[] {
  if (!Array.isArray(value)) {
    errors.push(
      issue(
        'invalid-event-effects-structure',
        `${path} 必须是效果数组。`,
        eventId,
      ),
    )
    return []
  }
  return value
    .map((effect, index) =>
      sanitizeEffect(effect, `${path}[${index}]`, eventId, errors),
    )
    .filter((effect) => effect !== null)
}

function sanitizeResolution(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): EventResolution {
  if (!isRecord(value) || typeof value.type !== 'string') {
    errors.push(
      issue(
        'invalid-event-resolution-structure',
        `${path} 必须是带有 type 的解析对象。`,
        eventId,
      ),
    )
    return { type: 'effects', effects: [] }
  }
  if (value.type === 'effects') {
    rejectUnknownFields(
      value,
      ['type', 'effects'],
      'unknown-event-resolution-field',
      path,
      eventId,
      errors,
    )
    return {
      type: value.type,
      effects: sanitizeEffects(value.effects, `${path}.effects`, eventId, errors),
    }
  }
  if (value.type !== 'partyCheck') {
    errors.push(
      issue(
        'unknown-event-resolution',
        `${path} 包含未知解析类型：${value.type}`,
        eventId,
      ),
    )
    return { type: 'effects', effects: [] }
  }

  rejectUnknownFields(
    value,
    [
      'type',
      'stat',
      'difficulty',
      'randomBonus',
      'successEffects',
      'failureEffects',
    ],
    'unknown-event-resolution-field',
    path,
    eventId,
    errors,
  )

  const stat = value.stat
  const validStat =
    stat === 'power' || stat === 'insight' || stat === 'survival'
  if (!validStat) {
    errors.push(
      issue(
        'invalid-party-check',
        `${path}.stat 引用了未知属性：${describeUnknown(stat)}`,
        eventId,
      ),
    )
  }
  const randomBonus = sanitizeRange(
    value.randomBonus,
    `${path}.randomBonus`,
    eventId,
    errors,
  )
  return {
    type: value.type,
    stat: validStat ? stat : 'power',
    difficulty: requireNumberField(value, 'difficulty', path, eventId, errors),
    randomBonus: randomBonus ?? { min: Number.NaN, max: Number.NaN },
    successEffects: sanitizeEffects(
      value.successEffects,
      `${path}.successEffects`,
      eventId,
      errors,
    ),
    failureEffects: sanitizeEffects(
      value.failureEffects,
      `${path}.failureEffects`,
      eventId,
      errors,
    ),
  }
}

function sanitizePolicyModifiers(
  value: unknown,
  path: string,
  eventId: string,
  errors: ContentValidationIssue[],
): AdventureEventDefinition['policyModifiers'] {
  if (value === undefined) {
    return undefined
  }
  if (!isRecord(value)) {
    errors.push(
      issue(
        'invalid-policy-modifiers-structure',
        `${path} 必须是方针修正对象。`,
        eventId,
      ),
    )
    return undefined
  }

  const modifiers: Partial<Record<ExpeditionPolicy, EventPolicyModifier>> = {}
  for (const [policyId, candidate] of Object.entries(value)) {
    if (!isExpeditionPolicy(policyId)) {
      errors.push(
        issue(
          'unknown-modifier-policy',
          `${path} 引用了未知方针：${policyId}`,
          eventId,
        ),
      )
      continue
    }
    if (!isRecord(candidate)) {
      errors.push(
        issue(
          'invalid-policy-modifier',
          `${path}.${policyId} 必须是修正对象。`,
          eventId,
        ),
      )
      continue
    }
    rejectUnknownFields(
      candidate,
      ['weightMultiplier', 'rewardMultiplier', 'damageMultiplier'],
      'unknown-policy-modifier-field',
      `${path}.${policyId}`,
      eventId,
      errors,
    )
    const modifier: EventPolicyModifier = {}
    for (const field of [
      'weightMultiplier',
      'rewardMultiplier',
      'damageMultiplier',
    ] as const) {
      const fieldValue = candidate[field]
      if (fieldValue === undefined) {
        continue
      }
      if (typeof fieldValue !== 'number') {
        errors.push(
          issue(
            'invalid-policy-modifier',
            `${path}.${policyId}.${field} 必须是数值。`,
            eventId,
          ),
        )
      } else {
        modifier[field] = fieldValue
      }
    }
    modifiers[policyId] = modifier
  }
  return modifiers
}

function sanitizeEvent(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): AdventureEventDefinition | null {
  const path = `content.events[${index}]`
  if (!isRecord(value)) {
    errors.push(
      issue('invalid-event-structure', `${path} 必须是事件对象。`),
    )
    return null
  }
  const id = requireStringField(value, 'id', path, undefined, errors)
  const title = requireStringField(value, 'title', path, id, errors)
  const regionIds = readStringArray(value, 'regionIds', path, id, errors)
  const rawTags = requireArrayField(value, 'tags', path, id, errors)
  const tags: EventTag[] = []
  for (const [tagIndex, tag] of rawTags.entries()) {
    if (isEventTag(tag)) {
      tags.push(tag)
    } else {
      errors.push(
        issue(
          'invalid-event-tags',
          `${path}.tags[${tagIndex}] 是未知标签：${describeUnknown(tag)}`,
          id,
        ),
      )
    }
  }
  const description = value.description
  if (description !== undefined && typeof description !== 'string') {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.description 必须是字符串。`,
        id,
      ),
    )
  }
  const policyModifiers = sanitizePolicyModifiers(
    value.policyModifiers,
    `${path}.policyModifiers`,
    id,
    errors,
  )

  return {
    id,
    title,
    ...(typeof description === 'string' ? { description } : {}),
    regionIds,
    tags,
    baseWeight: requireNumberField(value, 'baseWeight', path, id, errors),
    conditions: sanitizeConditions(
      value.conditions,
      `${path}.conditions`,
      id,
      errors,
    ),
    ...(policyModifiers === undefined ? {} : { policyModifiers }),
    resolution: sanitizeResolution(
      value.resolution,
      `${path}.resolution`,
      id,
      errors,
    ),
  }
}

function sanitizeHero(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): ContentCatalog['heroes'][number] | null {
  const path = `content.heroes[${index}]`
  if (!isRecord(value)) {
    errors.push(issue('invalid-hero-structure', `${path} 必须是英雄对象。`))
    return null
  }
  const id = requireStringField(value, 'id', path, undefined, errors)
  const role = value.role
  if (!isHeroRole(role)) {
    errors.push(
      issue(
        'unknown-hero-role',
        `${path}.role 引用了未知职业：${describeUnknown(role)}`,
        id,
      ),
    )
  }
  return {
    id,
    name: requireStringField(value, 'name', path, id, errors),
    role: isHeroRole(role) ? role : 'vanguard',
    level: requireNumberField(value, 'level', path, id, errors),
    maxHealth: requireNumberField(value, 'maxHealth', path, id, errors),
    power: requireNumberField(value, 'power', path, id, errors),
    insight: requireNumberField(value, 'insight', path, id, errors),
    survival: requireNumberField(value, 'survival', path, id, errors),
    traitIds: readStringArray(value, 'traitIds', path, id, errors),
  }
}

function sanitizeTrait(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): ContentCatalog['traits'][number] | null {
  const path = `content.traits[${index}]`
  if (!isRecord(value)) {
    errors.push(issue('invalid-trait-structure', `${path} 必须是特质对象。`))
    return null
  }
  const id = requireStringField(value, 'id', path, undefined, errors)
  return {
    id,
    name: requireStringField(value, 'name', path, id, errors),
    description: requireStringField(value, 'description', path, id, errors),
  }
}

function sanitizeRegion(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): ContentCatalog['regions'][number] | null {
  const path = `content.regions[${index}]`
  if (!isRecord(value)) {
    errors.push(issue('invalid-region-structure', `${path} 必须是区域对象。`))
    return null
  }
  const id = requireStringField(value, 'id', path, undefined, errors)
  return {
    id,
    name: requireStringField(value, 'name', path, id, errors),
    description: requireStringField(value, 'description', path, id, errors),
    eventIds: readStringArray(value, 'eventIds', path, id, errors),
    eventIntervalMs: requireNumberField(
      value,
      'eventIntervalMs',
      path,
      id,
      errors,
    ),
    maxEventCount: requireNumberField(
      value,
      'maxEventCount',
      path,
      id,
      errors,
    ),
  }
}

function sanitizeBuilding(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): ContentCatalog['buildings'][number] | null {
  const path = `content.buildings[${index}]`
  if (!isRecord(value)) {
    errors.push(
      issue('invalid-building-structure', `${path} 必须是建筑对象。`),
    )
    return null
  }
  const id = requireStringField(value, 'id', path, undefined, errors)
  const rawCosts = requireArrayField(
    value,
    'upgradeWoodCosts',
    path,
    id,
    errors,
  )
  const upgradeWoodCosts = rawCosts.map((cost, costIndex) => {
    if (typeof cost !== 'number') {
      errors.push(
        issue(
          'invalid-content-structure',
          `${path}.upgradeWoodCosts[${costIndex}] 必须是数值。`,
          id,
        ),
      )
      return Number.NaN
    }
    return cost
  })
  return {
    id,
    name: requireStringField(value, 'name', path, id, errors),
    maxLevel: requireNumberField(value, 'maxLevel', path, id, errors),
    upgradeWoodCosts,
  }
}

function sanitizePolicy(
  value: unknown,
  index: number,
  errors: ContentValidationIssue[],
): ContentCatalog['policies'][number] | null {
  const path = `content.policies[${index}]`
  if (!isRecord(value)) {
    errors.push(issue('invalid-policy-structure', `${path} 必须是方针对象。`))
    return null
  }
  if (!isExpeditionPolicy(value.id)) {
    errors.push(
      issue(
        'unknown-policy-id',
        `${path}.id 引用了未知方针：${describeUnknown(value.id)}`,
      ),
    )
    return null
  }
  const id = value.id
  const rawWeights = value.eventWeightMultipliers
  const weights = isRecord(rawWeights) ? rawWeights : {}
  if (!isRecord(rawWeights)) {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.eventWeightMultipliers 必须是对象。`,
        id,
      ),
    )
  }
  const threshold = value.healthReturnThreshold
  if (threshold !== null && typeof threshold !== 'number') {
    errors.push(
      issue(
        'invalid-content-structure',
        `${path}.healthReturnThreshold 必须是数值或 null。`,
        id,
      ),
    )
  }
  return {
    id,
    name: requireStringField(value, 'name', path, id, errors),
    description: requireStringField(value, 'description', path, id, errors),
    eventWeightMultipliers: {
      travel: requireNumberField(weights, 'travel', `${path}.eventWeightMultipliers`, id, errors),
      discovery: requireNumberField(weights, 'discovery', `${path}.eventWeightMultipliers`, id, errors),
      danger: requireNumberField(weights, 'danger', `${path}.eventWeightMultipliers`, id, errors),
    },
    rewardMultiplier: requireNumberField(
      value,
      'rewardMultiplier',
      path,
      id,
      errors,
    ),
    damageMultiplier: requireNumberField(
      value,
      'damageMultiplier',
      path,
      id,
      errors,
    ),
    healthReturnThreshold:
      threshold === null || typeof threshold === 'number'
        ? threshold
        : Number.NaN,
  }
}

function sanitizeCatalog(
  value: unknown,
  errors: ContentValidationIssue[],
): ContentCatalog {
  if (!isRecord(value)) {
    errors.push(
      issue('invalid-content-catalog', '内容注册表根节点必须是对象。'),
    )
    return {
      heroes: [],
      traits: [],
      regions: [],
      events: [],
      buildings: [],
      policies: [],
    }
  }

  const sanitizeList = <T>(
    field: string,
    sanitize: (
      item: unknown,
      index: number,
      issues: ContentValidationIssue[],
    ) => T | null,
  ): T[] =>
    requireArrayField(value, field, 'content', undefined, errors)
      .map((item, index) => sanitize(item, index, errors))
      .filter((item) => item !== null)

  return {
    heroes: sanitizeList('heroes', sanitizeHero),
    traits: sanitizeList('traits', sanitizeTrait),
    regions: sanitizeList('regions', sanitizeRegion),
    events: sanitizeList('events', sanitizeEvent),
    buildings: sanitizeList('buildings', sanitizeBuilding),
    policies: sanitizeList('policies', sanitizePolicy),
  }
}

function validateRange(
  range: NumericRange,
  label: string,
  contentId: string,
  errors: ContentValidationIssue[],
): void {
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    !Number.isSafeInteger(range.min) ||
    !Number.isSafeInteger(range.max) ||
    range.min > range.max
  ) {
    errors.push(
      issue(
        'invalid-numeric-range',
        `${label} 必须是 min <= max 的有限安全整数范围。`,
        contentId,
      ),
    )
  }
}

function validateFlag(
  flag: string,
  contentId: string,
  errors: ContentValidationIssue[],
): void {
  if (!FLAG_PATTERN.test(flag)) {
    errors.push(
      issue('invalid-expedition-flag', `旗标名称无效：${flag}`, contentId),
    )
  }
}

function validateEffects(
  eventId: string,
  effects: readonly EventEffect[],
  errors: ContentValidationIssue[],
): void {
  const resources = new Set<string>(RESOURCE_TYPES)
  const journalCategories = new Set<string>(JOURNAL_CATEGORIES)

  for (const effect of effects) {
    switch (effect.type) {
      case 'gainLoot':
      case 'loseLoot':
        if (!resources.has(effect.resource)) {
          errors.push(
            issue(
              'unknown-effect-resource',
              `事件引用了未知资源：${effect.resource}`,
              eventId,
            ),
          )
        }
        validateRange(effect.amount, `${effect.type} 数量`, eventId, errors)
        if (effect.amount.min < 0) {
          errors.push(
            issue(
              'negative-resource-effect',
              `${effect.type} 的资源数量不得为负。`,
              eventId,
            ),
          )
        }
        break
      case 'damageHero':
      case 'healHero':
        if (!HERO_TARGETS.has(effect.target)) {
          errors.push(
            issue(
              'unknown-hero-target',
              `事件引用了未知英雄目标：${effect.target}`,
              eventId,
            ),
          )
        }
        validateRange(effect.amount, `${effect.type} 数量`, eventId, errors)
        if (effect.amount.min < 0) {
          errors.push(
            issue(
              'negative-health-effect',
              `${effect.type} 的数量不得为负。`,
              eventId,
            ),
          )
        }
        if (
          effect.type === 'damageHero' &&
          effect.minimumHealth !== undefined &&
          (!Number.isFinite(effect.minimumHealth) ||
            effect.minimumHealth < 1)
        ) {
          errors.push(
            issue(
              'invalid-minimum-health',
              'damageHero 的 minimumHealth 必须至少为 1。',
              eventId,
            ),
          )
        }
        break
      case 'appendJournal':
        if (!journalCategories.has(effect.category)) {
          errors.push(
            issue(
              'unknown-journal-category',
              `事件引用了未知日志类别：${effect.category}`,
              eventId,
            ),
          )
        }
        if (effect.title.trim().length === 0 || effect.text.trim().length === 0) {
          errors.push(
            issue(
              'empty-journal-copy',
              'appendJournal 的标题和正文不得为空。',
              eventId,
            ),
          )
        }
        break
      case 'setExpeditionFlag':
      case 'clearExpeditionFlag':
        validateFlag(effect.flag, eventId, errors)
        break
      case 'adjustNextEventDelay':
        if (!Number.isFinite(effect.seconds)) {
          errors.push(
            issue(
              'invalid-event-delay-adjustment',
              '下一事件时间调整必须是有限数。',
              eventId,
            ),
          )
        }
        break
      case 'requestReturn':
        if (effect.reason.trim().length === 0) {
          errors.push(
            issue(
              'empty-return-reason',
              '返程请求必须提供原因。',
              eventId,
            ),
          )
        }
        break
      default:
        errors.push(
          issue(
            'unknown-event-effect',
            `事件包含未知效果：${describeUnknown((effect as { type?: unknown }).type)}`,
            eventId,
          ),
        )
    }
  }
}

type ReferenceSets = {
  heroIds: ReadonlySet<string>
  traitIds: ReadonlySet<string>
  regionIds: ReadonlySet<string>
  policyIds: ReadonlySet<string>
}

function validateConditions(
  eventId: string,
  conditions: readonly EventCondition[],
  references: ReferenceSets,
  errors: ContentValidationIssue[],
): void {
  const roles = new Set<string>(HERO_ROLES)
  const resources = new Set<string>(RESOURCE_TYPES)
  const policies = new Set<string>()
  const regions = new Set<string>()
  const presentFlags = new Set<string>()
  const absentFlags = new Set<string>()

  for (const condition of conditions) {
    switch (condition.type) {
      case 'regionIs':
        regions.add(condition.regionId)
        if (!references.regionIds.has(condition.regionId)) {
          errors.push(
            issue(
              'unknown-condition-region',
              `条件引用了未知区域：${condition.regionId}`,
              eventId,
            ),
          )
        }
        break
      case 'policyIs':
        policies.add(condition.policy)
        if (!references.policyIds.has(condition.policy)) {
          errors.push(
            issue(
              'unknown-condition-policy',
              `条件引用了未知方针：${condition.policy}`,
              eventId,
            ),
          )
        }
        break
      case 'partyHasRole':
        if (!roles.has(condition.role)) {
          errors.push(
            issue(
              'unknown-condition-role',
              `条件引用了未知职业：${condition.role}`,
              eventId,
            ),
          )
        }
        if (
          condition.minimum !== undefined &&
          (!Number.isSafeInteger(condition.minimum) || condition.minimum < 1)
        ) {
          errors.push(
            issue(
              'invalid-role-minimum',
              'partyHasRole.minimum 必须是正整数。',
              eventId,
            ),
          )
        }
        break
      case 'partyHasHero':
        if (!references.heroIds.has(condition.heroId)) {
          errors.push(
            issue(
              'unknown-condition-hero',
              `条件引用了未知英雄：${condition.heroId}`,
              eventId,
            ),
          )
        }
        break
      case 'partyHasTrait':
        if (!references.traitIds.has(condition.traitId)) {
          errors.push(
            issue(
              'unknown-condition-trait',
              `条件引用了未知特质：${condition.traitId}`,
              eventId,
            ),
          )
        }
        break
      case 'minimumPartyHealthRatioAtMost':
      case 'minimumPartyHealthRatioAtLeast':
        if (
          !Number.isFinite(condition.ratio) ||
          condition.ratio < 0 ||
          condition.ratio > 1
        ) {
          errors.push(
            issue(
              'invalid-health-ratio',
              '队伍生命比例必须位于 0 到 1。',
              eventId,
            ),
          )
        }
        break
      case 'eventIndexBetween':
        if (
          (condition.minimum !== undefined &&
            (!Number.isSafeInteger(condition.minimum) ||
              condition.minimum < 1)) ||
          (condition.maximum !== undefined &&
            (!Number.isSafeInteger(condition.maximum) ||
              condition.maximum < 1)) ||
          (condition.minimum !== undefined &&
            condition.maximum !== undefined &&
            condition.minimum > condition.maximum)
        ) {
          errors.push(
            issue(
              'invalid-event-index-range',
              '事件序号使用 1 基，且 minimum 不得大于 maximum。',
              eventId,
            ),
          )
        }
        break
      case 'lootAtLeast':
        if (!resources.has(condition.resource)) {
          errors.push(
            issue(
              'unknown-condition-resource',
              `条件引用了未知资源：${condition.resource}`,
              eventId,
            ),
          )
        }
        if (!Number.isFinite(condition.amount) || condition.amount < 0) {
          errors.push(
            issue(
              'invalid-loot-threshold',
              '战利品条件数量必须是有限非负数。',
              eventId,
            ),
          )
        }
        break
      case 'expeditionFlagPresent':
        presentFlags.add(condition.flag)
        validateFlag(condition.flag, eventId, errors)
        break
      case 'expeditionFlagAbsent':
        absentFlags.add(condition.flag)
        validateFlag(condition.flag, eventId, errors)
        break
      default:
        errors.push(
          issue(
            'unknown-event-condition',
            `事件包含未知条件：${describeUnknown((condition as { type?: unknown }).type)}`,
            eventId,
          ),
        )
    }
  }

  if (policies.size > 1) {
    errors.push(
      issue(
        'conflicting-policy-conditions',
        '事件包含相互冲突的 policyIs 条件。',
        eventId,
      ),
    )
  }
  if (regions.size > 1) {
    errors.push(
      issue(
        'conflicting-region-conditions',
        '事件包含相互冲突的 regionIs 条件。',
        eventId,
      ),
    )
  }
  for (const flag of presentFlags) {
    if (absentFlags.has(flag)) {
      errors.push(
        issue(
          'conflicting-flag-conditions',
          `事件同时要求旗标存在和不存在：${flag}`,
          eventId,
        ),
      )
    }
  }
}

function validateModifier(
  eventId: string,
  policyId: string,
  modifier: EventPolicyModifier,
  errors: ContentValidationIssue[],
): void {
  for (const [field, value] of Object.entries(modifier)) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(
        issue(
          'invalid-policy-modifier',
          `${policyId}.${field} 必须是有限非负数。`,
          eventId,
        ),
      )
    }
  }
}

function validateEvent(
  event: AdventureEventDefinition,
  references: ReferenceSets,
  errors: ContentValidationIssue[],
): void {
  if (!Number.isFinite(event.baseWeight) || event.baseWeight <= 0) {
    errors.push(
      issue(
        'invalid-event-base-weight',
        '事件 baseWeight 必须是有限正数。',
        event.id,
      ),
    )
  }
  if (event.regionIds.length === 0) {
    errors.push(
      issue('event-without-region', '事件必须引用至少一个区域。', event.id),
    )
  }
  for (const regionId of event.regionIds) {
    if (!references.regionIds.has(regionId)) {
      errors.push(
        issue(
          'unknown-event-region',
          `事件引用了未知区域：${regionId}`,
          event.id,
        ),
      )
    }
  }
  if (
    event.tags.length === 0 ||
    event.tags.some((tag) => !EVENT_TAGS.includes(tag))
  ) {
    errors.push(issue('invalid-event-tags', '事件标签无效。', event.id))
  }

  validateConditions(event.id, event.conditions ?? [], references, errors)
  for (const [policyId, modifier] of Object.entries(
    event.policyModifiers ?? {},
  )) {
    if (!references.policyIds.has(policyId)) {
      errors.push(
        issue(
          'unknown-modifier-policy',
          `事件修正引用了未知方针：${policyId}`,
          event.id,
        ),
      )
    }
    if (modifier !== undefined) {
      validateModifier(event.id, policyId, modifier, errors)
    }
  }
  if (
    !EXPEDITION_POLICIES.some(
      (policy) => calculateEventWeight(event, policy) > 0,
    )
  ) {
    errors.push(
      issue(
        'event-has-no-positive-weight',
        '事件在所有方针下的最终权重均为零。',
        event.id,
      ),
    )
  }

  if (event.resolution.type === 'effects') {
    validateEffects(event.id, event.resolution.effects, errors)
  } else if (event.resolution.type === 'partyCheck') {
    if (
      !['power', 'insight', 'survival'].includes(event.resolution.stat) ||
      !Number.isFinite(event.resolution.difficulty)
    ) {
      errors.push(
        issue(
          'invalid-party-check',
          '能力检定属性或难度无效。',
          event.id,
        ),
      )
    }
    validateRange(
      event.resolution.randomBonus,
      '能力检定随机修正',
      event.id,
      errors,
    )
    validateEffects(event.id, event.resolution.successEffects, errors)
    validateEffects(event.id, event.resolution.failureEffects, errors)
  } else {
    errors.push(
      issue('unknown-event-resolution', '事件解析类型无效。', event.id),
    )
  }
}

function makeValidationHero(hero: ContentCatalog['heroes'][number]): HeroState {
  return {
    ...hero,
    traitIds: [...hero.traitIds],
    health: hero.maxHealth,
    status: 'idle',
  }
}

function heroPairs(heroes: readonly HeroState[]): readonly HeroState[][] {
  const pairs: HeroState[][] = []
  for (let left = 0; left < heroes.length; left += 1) {
    for (let right = left + 1; right < heroes.length; right += 1) {
      const first = heroes[left]
      const second = heroes[right]
      if (first !== undefined && second !== undefined) {
        pairs.push([first, second])
      }
    }
  }
  return pairs
}

function validateEventTitles(
  events: readonly AdventureEventDefinition[],
  errors: ContentValidationIssue[],
): void {
  const titleOwners = new Map<string, string>()
  const reservedTitles = new Set<string>(RESERVED_ADVENTURE_EVENT_TITLES)

  for (const event of events) {
    const normalizedTitle = event.title.trim()
    if (normalizedTitle.length === 0) {
      errors.push(
        issue('empty-event-title', '事件标题不得为空。', event.id),
      )
      continue
    }
    if (reservedTitles.has(normalizedTitle)) {
      errors.push(
        issue(
          'reserved-event-title',
          `事件标题为系统诊断保留值：${normalizedTitle}`,
          event.id,
        ),
      )
    }
    const owner = titleOwners.get(normalizedTitle)
    if (owner !== undefined) {
      errors.push(
        issue(
          'duplicate-event-title',
          `事件标题与 ${owner} 重复：${normalizedTitle}`,
          event.id,
        ),
      )
    } else {
      titleOwners.set(normalizedTitle, event.id)
    }
  }
}

type EventIndexBounds = {
  minimum: number
  maximum: number
}

function getEventIndexBounds(
  conditions: readonly EventCondition[],
  maximumEventCount: number,
): EventIndexBounds | null {
  let minimum = 1
  let maximum = maximumEventCount
  for (const condition of conditions) {
    if (condition.type !== 'eventIndexBetween') {
      continue
    }
    if (
      (condition.minimum !== undefined &&
        !Number.isSafeInteger(condition.minimum)) ||
      (condition.maximum !== undefined &&
        !Number.isSafeInteger(condition.maximum))
    ) {
      return null
    }
    minimum = Math.max(minimum, condition.minimum ?? 1)
    maximum = Math.min(maximum, condition.maximum ?? maximumEventCount)
  }
  return minimum >= 1 && minimum <= maximum ? { minimum, maximum } : null
}

function getReachableEventIndex(
  conditions: readonly EventCondition[],
  maximumEventCount: number,
): number | null {
  return getEventIndexBounds(conditions, maximumEventCount)?.minimum ?? null
}

function getReachablePartyHealth(
  party: readonly HeroState[],
  conditions: readonly EventCondition[],
): HeroState[] | null {
  let lowerBound = 0
  let upperBound = 1
  for (const condition of conditions) {
    if (condition.type === 'minimumPartyHealthRatioAtLeast') {
      lowerBound = Math.max(lowerBound, condition.ratio)
    } else if (condition.type === 'minimumPartyHealthRatioAtMost') {
      upperBound = Math.min(upperBound, condition.ratio)
    }
  }
  if (
    !Number.isFinite(lowerBound) ||
    !Number.isFinite(upperBound) ||
    lowerBound < 0 ||
    upperBound > 1 ||
    lowerBound > upperBound
  ) {
    return null
  }

  for (const target of party) {
    if (!Number.isSafeInteger(target.maxHealth) || target.maxHealth < 1) {
      continue
    }
    const health = Math.max(1, Math.ceil(lowerBound * target.maxHealth))
    const ratio = health / target.maxHealth
    if (health <= target.maxHealth && ratio <= upperBound) {
      return party.map((hero) => ({
        ...hero,
        health: hero.id === target.id ? health : hero.maxHealth,
      }))
    }
  }
  return null
}

function createReachabilityContext(
  event: AdventureEventDefinition,
  regionId: string,
  policy: ExpeditionPolicy,
  party: readonly HeroState[],
  maximumEventCount: number,
): EventConditionContext | null {
  const conditions = event.conditions ?? []
  const eventIndex = getReachableEventIndex(conditions, maximumEventCount)
  const reachableParty = getReachablePartyHealth(party, conditions)
  if (eventIndex === null || reachableParty === null) {
    return null
  }

  const loot = { wood: 0, coins: 0, food: 0, medicine: 0 }
  const presentFlags = new Set<string>()
  const absentFlags = new Set<string>()
  for (const condition of conditions) {
    if (condition.type === 'lootAtLeast') {
      loot[condition.resource] = Math.max(
        loot[condition.resource],
        Math.ceil(condition.amount),
      )
    } else if (condition.type === 'expeditionFlagPresent') {
      presentFlags.add(condition.flag)
    } else if (condition.type === 'expeditionFlagAbsent') {
      absentFlags.add(condition.flag)
    }
  }
  if ([...presentFlags].some((flag) => absentFlags.has(flag))) {
    return null
  }

  return {
    regionId,
    policy,
    party: reachableParty,
    eventIndex,
    loot,
    eventFlags: [...presentFlags],
  }
}

function validateEventReachability(
  catalog: ContentCatalog,
  errors: ContentValidationIssue[],
): void {
  const validationHeroes = catalog.heroes.map(makeValidationHero)
  const pairs = heroPairs(validationHeroes)

  for (const event of catalog.events) {
    let reachable = false
    for (const regionId of event.regionIds) {
      const region = catalog.regions.find(
        (candidate) =>
          candidate.id === regionId && candidate.eventIds.includes(event.id),
      )
      if (
        region === undefined ||
        !Number.isSafeInteger(region.maxEventCount) ||
        region.maxEventCount < 1
      ) {
        continue
      }
      for (const policy of catalog.policies) {
        if (calculateEventWeight(event, policy.id) <= 0) {
          continue
        }
        for (const party of pairs) {
          const context = createReachabilityContext(
            event,
            region.id,
            policy.id,
            party,
            region.maxEventCount,
          )
          if (
            context !== null &&
            evaluateEventConditions(event.conditions, context)
          ) {
            reachable = true
            break
          }
        }
        if (reachable) {
          break
        }
      }
      if (reachable) {
        break
      }
    }
    if (!reachable) {
      errors.push(
        issue(
          'unreachable-event',
          '事件在当前区域、方针、双人队伍和事件序号约束下永远不可触发。',
          event.id,
        ),
      )
    }
  }
}

function conditionDependsOnMutableExpeditionState(
  condition: EventCondition,
): boolean {
  switch (condition.type) {
    case 'minimumPartyHealthRatioAtMost':
    case 'minimumPartyHealthRatioAtLeast':
    case 'lootAtLeast':
    case 'expeditionFlagPresent':
    case 'expeditionFlagAbsent':
      return true
    case 'regionIs':
    case 'policyIs':
    case 'partyHasRole':
    case 'partyHasHero':
    case 'partyHasTrait':
    case 'eventIndexBetween':
      return false
  }
}

function getGuaranteedEventIndexBounds(
  event: AdventureEventDefinition,
  regionId: string,
  policy: ExpeditionPolicy,
  party: readonly HeroState[],
  maximumEventCount: number,
): EventIndexBounds | null {
  const conditions = event.conditions ?? []
  if (
    !event.regionIds.includes(regionId) ||
    calculateEventWeight(event, policy) <= 0 ||
    conditions.some(conditionDependsOnMutableExpeditionState)
  ) {
    return null
  }

  const bounds = getEventIndexBounds(conditions, maximumEventCount)
  if (bounds === null) {
    return null
  }
  const nonIndexConditions = conditions.filter(
    (condition) => condition.type !== 'eventIndexBetween',
  )
  return evaluateEventConditions(nonIndexConditions, {
    regionId,
    policy,
    party,
    eventIndex: bounds.minimum,
    loot: { wood: 0, coins: 0, food: 0, medicine: 0 },
    eventFlags: [],
  })
    ? bounds
    : null
}

function findFirstMissingGuaranteedEventIndex(
  events: readonly AdventureEventDefinition[],
  regionId: string,
  policy: ExpeditionPolicy,
  party: readonly HeroState[],
  maximumEventCount: number,
): number | null {
  const intervals = events
    .map((event) =>
      getGuaranteedEventIndexBounds(
        event,
        regionId,
        policy,
        party,
        maximumEventCount,
      ),
    )
    .filter((bounds) => bounds !== null)
    .sort(
      (left, right) =>
        left.minimum - right.minimum || left.maximum - right.maximum,
    )

  let coveredThrough = 0
  for (const interval of intervals) {
    if (interval.minimum > coveredThrough + 1) {
      return coveredThrough + 1
    }
    coveredThrough = Math.max(coveredThrough, interval.maximum)
    if (coveredThrough >= maximumEventCount) {
      return null
    }
  }
  return coveredThrough + 1
}

function validateRegionCoverage(
  catalog: ContentCatalog,
  errors: ContentValidationIssue[],
): void {
  const eventById = new Map(catalog.events.map((event) => [event.id, event]))
  const validationHeroes = catalog.heroes.map(makeValidationHero)
  const pairs = heroPairs(validationHeroes)

  for (const region of catalog.regions) {
    const events = region.eventIds
      .map((eventId) => eventById.get(eventId))
      .filter((event) => event !== undefined)
    if (new Set(region.eventIds).size !== region.eventIds.length) {
      errors.push(
        issue(
          'duplicate-region-event-id',
          '区域包含重复的事件引用。',
          region.id,
        ),
      )
    }
    for (const eventId of region.eventIds) {
      const event = eventById.get(eventId)
      if (event === undefined) {
        errors.push(
          issue(
            'unknown-region-event',
            `区域引用了未知事件：${eventId}`,
            region.id,
          ),
        )
      } else if (!event.regionIds.includes(region.id)) {
        errors.push(
          issue(
            'inconsistent-event-region-reference',
            `事件 ${eventId} 未反向引用区域。`,
            region.id,
          ),
        )
      }
    }
    if (!events.some((event) => event.tags.includes('safe'))) {
      errors.push(
        issue('region-without-safe-event', '区域缺少 safe 事件。', region.id),
      )
    }
    if (!events.some((event) => event.tags.includes('reward'))) {
      errors.push(
        issue(
          'region-without-reward-event',
          '区域缺少 reward 事件。',
          region.id,
        ),
      )
    }
    if (!events.some((event) => event.baseWeight > 0)) {
      errors.push(
        issue(
          'region-without-triggerable-event',
          '区域缺少可触发事件。',
          region.id,
        ),
      )
    }

    if (
      Number.isSafeInteger(region.maxEventCount) &&
      region.maxEventCount > 0
    ) {
      for (const policy of catalog.policies) {
        for (const party of pairs) {
          const missingEventIndex = findFirstMissingGuaranteedEventIndex(
            events,
            region.id,
            policy.id,
            party,
            region.maxEventCount,
          )
          if (missingEventIndex !== null) {
            errors.push(
              issue(
                'region-party-index-has-no-guaranteed-candidate',
                `方针 ${policy.id}、队伍 ${party.map((hero) => hero.id).join('+')} 在事件序号 ${missingEventIndex} 没有不依赖可变远征状态的保证候选事件。`,
                region.id,
              ),
            )
          }
        }
      }
    }
  }

  for (const event of catalog.events) {
    for (const regionId of event.regionIds) {
      const region = catalog.regions.find((candidate) => candidate.id === regionId)
      if (region !== undefined && !region.eventIds.includes(event.id)) {
        errors.push(
          issue(
            'inconsistent-region-event-reference',
            `区域 ${regionId} 未注册事件。`,
            event.id,
          ),
        )
      }
    }
  }
}

function validateHeroBasics(
  hero: ContentCatalog['heroes'][number],
  errors: ContentValidationIssue[],
): void {
  if (!CONTENT_ID_PATTERN.test(hero.id)) {
    errors.push(
      issue('invalid-hero-id', `英雄 ID 无效：${hero.id}`, hero.id),
    )
  }
  if (hero.name.trim().length === 0) {
    errors.push(issue('empty-hero-name', '英雄名称不得为空。', hero.id))
  }
  if (!Number.isSafeInteger(hero.level) || hero.level < 1) {
    errors.push(
      issue('invalid-hero-level', '英雄等级必须是正安全整数。', hero.id),
    )
  }
  if (!Number.isSafeInteger(hero.maxHealth) || hero.maxHealth < 1) {
    errors.push(
      issue(
        'invalid-hero-max-health',
        '英雄最大生命必须是正安全整数。',
        hero.id,
      ),
    )
  }
  for (const stat of ['power', 'insight', 'survival'] as const) {
    if (!Number.isSafeInteger(hero[stat]) || hero[stat] < 0) {
      errors.push(
        issue(
          'invalid-hero-stat',
          `英雄属性 ${stat} 必须是非负安全整数。`,
          hero.id,
        ),
      )
    }
  }
  for (const traitId of hero.traitIds) {
    if (!CONTENT_ID_PATTERN.test(traitId)) {
      errors.push(
        issue(
          'invalid-hero-trait-id',
          `英雄引用的特质 ID 无效：${traitId}`,
          hero.id,
        ),
      )
    }
  }
}

export function validateGameContent(
  catalog: unknown = GAME_CONTENT,
): ContentValidationResult {
  const errors: ContentValidationIssue[] = []
  const warnings: ContentValidationIssue[] = []
  validateSerializable(catalog, 'content', new Set<object>(), errors)
  const content = sanitizeCatalog(catalog, errors)
  errors.push(
    ...collectDuplicateIds('hero', content.heroes),
    ...collectDuplicateIds('trait', content.traits),
    ...collectDuplicateIds('region', content.regions),
    ...collectDuplicateIds('event', content.events),
    ...collectDuplicateIds('building', content.buildings),
    ...collectDuplicateIds('policy', content.policies),
  )

  const references: ReferenceSets = {
    heroIds: new Set(content.heroes.map((hero) => hero.id)),
    traitIds: new Set(content.traits.map((trait) => trait.id)),
    regionIds: new Set(content.regions.map((region) => region.id)),
    policyIds: new Set(content.policies.map((policy) => policy.id)),
  }
  const roles = new Set<string>(HERO_ROLES)

  for (const trait of content.traits) {
    if (!CONTENT_ID_PATTERN.test(trait.id)) {
      errors.push(
        issue('invalid-trait-id', `特质 ID 无效：${trait.id}`, trait.id),
      )
    }
  }

  for (const hero of content.heroes) {
    validateHeroBasics(hero, errors)
    if (!roles.has(hero.role)) {
      errors.push(
        issue('unknown-hero-role', `英雄职业无效：${hero.role}`, hero.id),
      )
    }
    if (new Set(hero.traitIds).size !== hero.traitIds.length) {
      errors.push(
        issue('duplicate-hero-trait', '英雄包含重复特质引用。', hero.id),
      )
    }
    for (const traitId of hero.traitIds) {
      if (!references.traitIds.has(traitId)) {
        errors.push(
          issue(
            'unknown-hero-trait',
            `英雄引用了未知特质：${traitId}`,
            hero.id,
          ),
        )
      }
    }
  }

  for (const event of content.events) {
    validateEvent(event, references, errors)
  }
  validateEventTitles(content.events, errors)
  validateEventReachability(content, errors)
  validateRegionCoverage(content, errors)

  if (!content.regions.some((region) => region.id === 'black-fir-forest')) {
    errors.push(
      issue(
        'missing-required-region',
        '缺少必需区域：black-fir-forest',
        'black-fir-forest',
      ),
    )
  }

  for (const region of content.regions) {
    if (
      !Number.isSafeInteger(region.eventIntervalMs) ||
      !Number.isSafeInteger(region.maxEventCount) ||
      region.eventIntervalMs <= 0 ||
      region.maxEventCount <= 0
    ) {
      errors.push(
        issue('invalid-region-timing', '区域推进配置无效。', region.id),
      )
    }
  }
  for (const building of content.buildings) {
    if (
      !Number.isSafeInteger(building.maxLevel) ||
      building.maxLevel < 0 ||
      building.upgradeWoodCosts.length !== building.maxLevel ||
      building.upgradeWoodCosts.some(
        (cost) => !Number.isSafeInteger(cost) || cost <= 0,
      )
    ) {
      errors.push(
        issue('invalid-building-levels', '建筑升级配置无效。', building.id),
      )
    }
  }
  for (const policy of content.policies) {
    if (
      !Number.isFinite(policy.rewardMultiplier) ||
      !Number.isFinite(policy.damageMultiplier) ||
      policy.rewardMultiplier < 0 ||
      policy.damageMultiplier < 0 ||
      Object.values(policy.eventWeightMultipliers).some(
        (multiplier) => !Number.isFinite(multiplier) || multiplier < 0,
      ) ||
      (policy.healthReturnThreshold !== null &&
        (!Number.isFinite(policy.healthReturnThreshold) ||
          policy.healthReturnThreshold < 0 ||
          policy.healthReturnThreshold > 1))
    ) {
      errors.push(
        issue('invalid-policy-definition', '行动方针配置无效。', policy.id),
      )
    }
  }

  errors.sort(compareIssues)
  warnings.sort(compareIssues)
  return { valid: errors.length === 0, errors, warnings }
}

export const validateContent = validateGameContent

export function assertValidContent(
  catalog: ContentCatalog = GAME_CONTENT,
): void {
  const result = validateGameContent(catalog)
  if (!result.valid) {
    throw new Error(
      `内容校验失败：\n${result.errors
        .map((entry) => `[${entry.code}] ${entry.message}`)
        .join('\n')}`,
    )
  }
}

export { GAME_CONTENT }
