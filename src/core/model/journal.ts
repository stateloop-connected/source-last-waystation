export const JOURNAL_CATEGORIES = [
  'system',
  'travel',
  'event',
  'combat',
  'reward',
  'warning',
  'return',
] as const

export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number]

export type JournalEntry = {
  id: string
  timestamp: number
  expeditionId?: string
  category: JournalCategory
  title: string
  text: string
}
