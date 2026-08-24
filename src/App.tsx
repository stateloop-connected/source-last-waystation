import { Database, Map, RadioTower, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  EXPEDITION_POLICY_DEFINITIONS,
  REGION_DEFINITIONS,
  WATCHTOWER_DEFINITION,
  getOfflineCapHours,
  getWatchtowerUpgradeCost,
  startExpedition as previewStartExpedition,
  upgradeWatchtower as previewWatchtowerUpgrade,
  type ExpeditionPolicy,
} from './core'
import { useGame } from './app/useGame'
import { ActiveExpedition } from './components/ActiveExpedition'
import { AdventureJournal } from './components/AdventureJournal'
import { DeveloperTools } from './components/DeveloperTools'
import {
  MotionPreferenceControl,
  OfflineSummary,
  ReturnSummary,
} from './components/expedition-scene'
import { ExpeditionSetup } from './components/ExpeditionSetup'
import { ResourceBar } from './components/ResourceBar'
import { SaveTools } from './components/SaveTools'
import { StationPanel } from './components/StationPanel'
import { useVisualEffects } from './presentation/useVisualEffects'
import type { ProgressSummaryVisualEvent } from './presentation/visual-events'
import './styles/app.css'

const REGION = REGION_DEFINITIONS[0]

export default function App() {
  const {
    events: visualEvents,
    returnSummary,
    progressSummary,
    isPageVisible,
    dismissEvent,
    dismissReturnSummary,
    dismissProgressSummary,
  } = useVisualEffects()
  const {
    game,
    now,
    lastSavedAt,
    saveMessage,
    notice,
    start,
    retreat,
    upgradeWatchtower,
    exportSave,
    importSave,
    resetGame,
    debugAdvance,
    debugAddWood,
    clearNotice,
  } = useGame()
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>([])
  const [selectedPolicy, setSelectedPolicy] =
    useState<ExpeditionPolicy>('explore')
  const transientProgressSummary = visualEvents.findLast(
    (event): event is ProgressSummaryVisualEvent =>
      event.type === 'progressSummary',
  )

  const startDisabledReason = useMemo(() => {
    const preview = previewStartExpedition(
      game,
      {
        heroIds: selectedHeroIds,
        regionId: REGION.id,
        policy: selectedPolicy,
        seed: 1,
      },
      now,
    )
    return preview.ok ? null : preview.error
  }, [game, now, selectedHeroIds, selectedPolicy])

  const upgradeDisabledReason = useMemo(() => {
    const preview = previewWatchtowerUpgrade(game, now)
    return preview.ok ? null : preview.error
  }, [game, now])

  const toggleHero = (heroId: string) => {
    setSelectedHeroIds((current) => {
      if (current.includes(heroId)) {
        return current.filter((id) => id !== heroId)
      }
      if (current.length >= 2) {
        return current
      }
      return [...current, heroId]
    })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <a className="brand" href="#main-content" aria-label="最后驿站首页">
            <span className="brand__mark" aria-hidden="true">
              <RadioTower size={21} strokeWidth={1.8} />
            </span>
            <span>
              <strong>最后驿站</strong>
              <small>LAST WAYSTATION</small>
            </span>
          </a>

          <div className="header-location" aria-label="当前区域">
            <Map size={16} aria-hidden="true" />
            <span>北境 · 黑杉林前哨</span>
          </div>

          <div className="save-indicator" aria-live="polite">
            <Database size={15} aria-hidden="true" />
            <span>{saveMessage}</span>
            <i aria-hidden="true" />
          </div>
        </div>
      </header>

      <ResourceBar resources={game.resources} />

      <main id="main-content" className="main-layout">
        <div className="game-column">
          {returnSummary !== null ? (
            <ReturnSummary
              heroes={game.heroes}
              onDismiss={dismissReturnSummary}
              summary={returnSummary}
            />
          ) : null}
          {progressSummary !== null ? (
            <OfflineSummary
              heroes={game.heroes}
              onDismiss={dismissProgressSummary}
              summary={progressSummary}
            />
          ) : null}
          {transientProgressSummary !== undefined ? (
            <OfflineSummary
              heroes={game.heroes}
              onDismiss={() => dismissEvent(transientProgressSummary.id)}
              summary={transientProgressSummary}
            />
          ) : null}
          {game.activeExpedition === null ? (
            <ExpeditionSetup
              heroes={game.heroes}
              policies={EXPEDITION_POLICY_DEFINITIONS}
              region={REGION}
              selectedIds={selectedHeroIds}
              selectedPolicy={selectedPolicy}
              disabledReason={startDisabledReason}
              onPolicyChange={setSelectedPolicy}
              onStart={() => start(selectedHeroIds, selectedPolicy)}
              onToggleHero={toggleHero}
            />
          ) : (
            <ActiveExpedition
              expedition={game.activeExpedition}
              heroes={game.heroes}
              now={now}
              regionName={REGION.name}
              visualEvents={visualEvents}
              isPageVisible={isPageVisible}
              onRetreat={retreat}
            />
          )}

          <StationPanel
            level={game.station.watchtowerLevel}
            maxLevel={WATCHTOWER_DEFINITION.maxLevel}
            nextCost={getWatchtowerUpgradeCost(game.station.watchtowerLevel)}
            offlineHours={getOfflineCapHours(game.station.watchtowerLevel)}
            disabledReason={upgradeDisabledReason}
            onUpgrade={upgradeWatchtower}
          />
        </div>

        <AdventureJournal entries={game.journal} />
      </main>

      <footer className="utility-band">
        <div className="utility-preferences">
          <MotionPreferenceControl />
        </div>
        <SaveTools
          lastSavedAt={lastSavedAt}
          saveMessage={saveMessage}
          onExport={exportSave}
          onImport={importSave}
          onReset={resetGame}
        />
        <p className="utility-band__footnote">
          本地单机存档 · 第 {game.completedExpeditions + 1} 次远征准备
        </p>
      </footer>

      {import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_TOOLS === 'true' ? (
        <DeveloperTools onAdvance={debugAdvance} onAddWood={debugAddWood} />
      ) : null}

      {notice !== null ? (
        <div
          className="notice"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{notice.message}</span>
          <button onClick={clearNotice} type="button" aria-label="关闭提示">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
