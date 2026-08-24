import {
  BookOpen,
  Footprints,
  Gift,
  Home,
  Radio,
  Swords,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { JournalCategory, JournalEntry } from '../core'
import {
  JOURNAL_CATEGORY_LABELS,
  formatJournalTime,
} from '../app/presentation'

type AdventureJournalProps = {
  entries: readonly JournalEntry[]
}

const CATEGORY_ICONS: Readonly<Record<JournalCategory, LucideIcon>> = {
  system: Radio,
  travel: Footprints,
  event: BookOpen,
  combat: Swords,
  reward: Gift,
  warning: TriangleAlert,
  return: Home,
}

export function AdventureJournal({ entries }: AdventureJournalProps) {
  const recentEntries = [...entries].sort(
    (left, right) => right.timestamp - left.timestamp,
  )

  return (
    <section className="journal-section" aria-labelledby="journal-title">
      <div className="section-heading section-heading--compact">
        <div>
          <span className="eyebrow">现场记录</span>
          <h2 id="journal-title">冒险日志</h2>
        </div>
        <span className="journal-count">{entries.length}/200</span>
      </div>

      {recentEntries.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={24} aria-hidden="true" />
          <p>远征日志还没有写下第一行。</p>
        </div>
      ) : (
        <ol aria-label="冒险日志条目" className="journal-list" tabIndex={0}>
          {recentEntries.map((entry) => {
            const Icon = CATEGORY_ICONS[entry.category]
            return (
              <li data-category={entry.category} key={entry.id}>
                <div className="journal-entry__marker">
                  <Icon size={15} aria-hidden="true" />
                </div>
                <article>
                  <div className="journal-entry__meta">
                    <span>{JOURNAL_CATEGORY_LABELS[entry.category]}</span>
                    <time dateTime={new Date(entry.timestamp).toISOString()}>
                      {formatJournalTime(entry.timestamp)}
                    </time>
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.text}</p>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
