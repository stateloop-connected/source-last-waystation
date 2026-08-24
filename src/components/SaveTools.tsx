import { Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { formatSavedTime } from '../app/presentation'

type SaveToolsProps = {
  lastSavedAt: number | null
  saveMessage: string
  onExport: () => void
  onImport: (json: string) => void
  onReset: () => void
}

export function SaveTools({
  lastSavedAt,
  saveMessage,
  onExport,
  onImport,
  onReset,
}: SaveToolsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (file === undefined) {
      return
    }

    void file.text().then(onImport, () => onImport(''))
    event.currentTarget.value = ''
  }

  const handleReset = () => {
    const confirmed = window.confirm(
      '确定重置游戏吗？当前本地存档会被新游戏覆盖。建议先导出备份。',
    )
    if (confirmed) {
      onReset()
    }
  }

  return (
    <section className="save-tools" aria-labelledby="save-tools-title">
      <div>
        <span className="eyebrow">本地档案</span>
        <h2 id="save-tools-title">存档工具</h2>
        <p>
          {saveMessage} · {formatSavedTime(lastSavedAt)}
        </p>
      </div>
      <div className="save-tools__actions">
        <button className="icon-command" onClick={onExport} type="button">
          <Download size={17} aria-hidden="true" />
          导出
        </button>
        <button
          className="icon-command"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload size={17} aria-hidden="true" />
          导入
        </button>
        <input
          ref={inputRef}
          accept="application/json,.json"
          hidden
          onChange={handleImport}
          type="file"
        />
        <button className="icon-command icon-command--danger" onClick={handleReset} type="button">
          <RotateCcw size={17} aria-hidden="true" />
          重置
        </button>
      </div>
    </section>
  )
}
