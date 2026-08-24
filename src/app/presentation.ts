import type {
  ExpeditionPolicy,
  HeroRole,
  HeroStatus,
  JournalCategory,
} from '../core'

export const HERO_ROLE_LABELS: Readonly<Record<HeroRole, string>> = {
  vanguard: '先锋',
  scout: '斥候',
  medic: '药师',
}

export const HERO_STATUS_LABELS: Readonly<Record<HeroStatus, string>> = {
  idle: '待命',
  expedition: '远征中',
  injured: '休养中',
}

export const POLICY_LABELS: Readonly<Record<ExpeditionPolicy, string>> = {
  cautious: '谨慎',
  explore: '探索',
  greedy: '逐利',
}

export const JOURNAL_CATEGORY_LABELS: Readonly<
  Record<JournalCategory, string>
> = {
  system: '驿站',
  travel: '行进',
  event: '见闻',
  combat: '遭遇',
  reward: '收获',
  warning: '警示',
  return: '返程',
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatJournalTime(timestamp: number): string {
  return timeFormatter.format(timestamp)
}

export function formatSavedTime(timestamp: number | null): string {
  if (timestamp === null) {
    return '尚未写入'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toString()
    .padStart(2, '0')}`
}
