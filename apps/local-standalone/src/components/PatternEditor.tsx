import { useEffect, useState } from 'react'
import {
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  PATTERN_SHIFT_OPTIONS,
  createBlankCustomPattern,
  validateCustomPattern,
  type CustomPattern
} from '../data/patterns'
import { SHIFT_META, shiftToneClass, type ShiftType } from '../data/shifts'

interface PatternEditorProps {
  /** 传入 = 编辑已有；不传 = 新建 */
  pattern?: CustomPattern
  /** 现有的全部自定义班序，用于重名与数量校验 */
  existing: CustomPattern[]
  onSave: (pattern: CustomPattern) => void
  onClose: () => void
}

/**
 * 24 格班序编辑器。
 *
 * 交互：点格子选中 → 点下方班次填入 → 自动跳到下一格，顺序录完一条班序。
 * 之所以不用「一行 24 格」：1440 下每格只剩 34px，两字的「白特」放不下，
 * 而矩阵里靠单字区分、编辑时用户需要看清全称，所以拆成两行各 12 格。
 */
export function PatternEditor({ pattern, existing, onSave, onClose }: PatternEditorProps) {
  const [draft, setDraft] = useState<CustomPattern>(() => pattern ?? createBlankCustomPattern())
  const [active, setActive] = useState(0)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // 编辑时传自己的 id，重名校验才会排除自己
  const errors = validateCustomPattern(
    { id: pattern?.id, name: draft.name, shifts: draft.shifts },
    existing
  )

  const activeShift = draft.shifts[active]

  function assign(shift: ShiftType) {
    setDraft(current => ({
      ...current,
      shifts: current.shifts.map((item, index) => (index === active ? shift : item))
    }))
    setActive(current => (current + 1) % PATTERN_CYCLE_LENGTH)
  }

  function commit() {
    if (errors.length > 0) {
      setShowErrors(true)
      return
    }
    onSave({ ...draft, name: draft.name.trim() })
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={pattern ? '编辑班序' : '新建班序'}
        aria-modal="true"
        className="dialog dialog-wide"
        role="dialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 className="dialog-title">{pattern ? '编辑班序' : '新建班序'}</h2>
            <p className="dialog-sub">
              {PATTERN_CYCLE_LENGTH} 天一轮 · 锚点日 {PATTERN_ANCHOR_DATE}
            </p>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>关闭</button>
        </header>

        <div className="dialog-body">
          <div className="field">
            <span className="field-label">班序名称</span>
            <input
              aria-label="班序名称"
              autoFocus
              className="input"
              placeholder="比如：4A、4B、4C"
              value={draft.name}
              onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div className="pattern-grid">
            {[0, 12].map(start => (
              <div className="pattern-grid-row" key={start}>
                {Array.from({ length: 12 }, (_, offset) => start + offset).map(index => (
                  <button
                    aria-label={`第 ${index + 1} 天：${SHIFT_META[draft.shifts[index]].label}`}
                    aria-pressed={active === index}
                    className={`shift-cell ${shiftToneClass(draft.shifts[index])}${active === index ? ' is-on' : ''}`}
                    key={index}
                    type="button"
                    onClick={() => setActive(index)}
                  >
                    <span className="shift-cell-num">{index + 1}</span>
                    <span className="shift-cell-text">{SHIFT_META[draft.shifts[index]].short}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <p className="editor-active">
            第 {active + 1} 天 · 现在是「{SHIFT_META[activeShift].label}」，点下面的班次填入，自动跳下一格
          </p>

          <div className="shift-palette" role="group" aria-label="选择班次">
            {PATTERN_SHIFT_OPTIONS.map(shift => (
              <button
                aria-pressed={activeShift === shift}
                className={`palette-option ${shiftToneClass(shift)}${activeShift === shift ? ' is-on' : ''}`}
                key={shift}
                type="button"
                onClick={() => assign(shift)}
              >
                {SHIFT_META[shift].label}
              </button>
            ))}
          </div>

          {showErrors && errors.length > 0 ? (
            <ul className="error-list" role="alert">
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          ) : null}

        </div>

        <footer className="dialog-foot">
          <span className="editor-hint">自建班序第一天对应锚点日 2026-06-07 的班次</span>
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose}>取消</button>
            <button className="btn btn-primary" type="button" onClick={commit}>
              {pattern ? '保存班序' : '创建班序'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
