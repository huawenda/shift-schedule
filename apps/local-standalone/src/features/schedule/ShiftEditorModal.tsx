import {
  canMarkLegalShift,
  getEditableShiftOptionsForBase,
  getOvertimePresetOptions,
  normalizeOvertimeHours,
  type LeaveDuration,
  type ShiftType
} from '@local/core'
import { leaveDurationOptions } from '../../appConstants'
import type { ShiftEditorState } from '../../appTypes'
import { useDialog } from '../../hooks/useDialog'
import {
  canRecordOvertime,
  formatOvertimeHours,
  getEditorEffectiveShift,
  getShiftClassName
} from '../../scheduleHelpers'

interface ShiftEditorModalProps {
  editor: ShiftEditorState
  isSavingRecord: boolean
  onCancel: () => void
  onLeaveDurationChange: (duration: LeaveDuration) => void
  onLegalChange: (isLegal: boolean) => void
  onOvertimeInputChange: (value: string) => void
  onSave: () => void
  onShiftChange: (shift: ShiftType | 'default') => void
}

export function ShiftEditorModal({
  editor,
  isSavingRecord,
  onCancel,
  onLeaveDurationChange,
  onLegalChange,
  onOvertimeInputChange,
  onSave,
  onShiftChange
}: ShiftEditorModalProps) {
  const sheetRef = useDialog(true, onCancel)
  const effectiveShift = getEditorEffectiveShift(editor)

  return (
    <div className="scrim" onClick={onCancel}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-editor-title"
        ref={sheetRef}
        onClick={event => event.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <h2 className="sheet-title" id="shift-editor-title">编辑班次</h2>
            <p className="sheet-sub">{editor.personName} · {editor.date}</p>
          </div>
        </header>

        <div className="sheet-body">
          <div className="field">
            <span className="field-label">默认班次</span>
            <div className="field-options">
              <button
                className="shift-option is-base"
                type="button"
                aria-pressed={editor.selectedShift === 'default'}
                onClick={() => onShiftChange('default')}
              >
                {editor.baseShift}
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">改为</span>
            <div className="field-options">
              {getEditableShiftOptionsForBase(editor.baseShift).map(shift => {
                const isDisabled = editor.isLegal && shift === '事假'
                return (
                  <button
                    className={`shift-option ${getShiftClassName(shift)}`}
                    type="button"
                    aria-pressed={effectiveShift === shift}
                    disabled={isDisabled}
                    key={shift}
                    onClick={() => onShiftChange(shift === editor.baseShift ? 'default' : shift)}
                  >
                    {shift}
                  </button>
                )
              })}
            </div>
          </div>

          {effectiveShift === '事假' ? (
            <div className="field">
              <span className="field-label">请假时长</span>
              <div className="field-options">
                {leaveDurationOptions.map(duration => (
                  <button
                    className="shift-option is-base"
                    type="button"
                    aria-pressed={editor.leaveDuration === duration}
                    key={duration}
                    onClick={() => onLeaveDurationChange(duration)}
                  >
                    {duration}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">法定加班</span>
            {canMarkLegalShift(effectiveShift) ? (
              <div className="field-options">
                <button
                  className="shift-option is-base"
                  type="button"
                  aria-pressed={!editor.isLegal}
                  onClick={() => onLegalChange(false)}
                >
                  否
                </button>
                <button
                  className="shift-option shift-legal"
                  type="button"
                  aria-pressed={editor.isLegal}
                  onClick={() => onLegalChange(true)}
                >
                  是
                </button>
              </div>
            ) : (
              <span className="field-note">{effectiveShift} 不计入法定加班</span>
            )}
          </div>

          <div className="field">
            <span className="field-label">加班时长</span>
            {canRecordOvertime(effectiveShift) ? (
              <>
                <div className="field-options">
                  {getOvertimePresetOptions(effectiveShift, editor.isLegal).map(hours => (
                    <button
                      className="shift-option is-base"
                      type="button"
                      aria-pressed={normalizeOvertimeHours(editor.overtimeInput) === hours}
                      key={hours}
                      onClick={() => onOvertimeInputChange(formatOvertimeHours(hours))}
                    >
                      {formatOvertimeHours(hours)}h
                    </button>
                  ))}
                </div>
                <label className="hours-row">
                  <input
                    className="hours-input"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    name="overtimeHours"
                    autoComplete="off"
                    placeholder="0"
                    value={editor.overtimeInput}
                    onChange={event => onOvertimeInputChange(event.target.value)}
                  />
                  <span className="hours-unit" aria-hidden="true">h</span>
                  <span className="hours-hint">最小单位 0.5</span>
                </label>
              </>
            ) : (
              <span className="field-note">{effectiveShift} 不记录加班</span>
            )}
          </div>
        </div>

        <footer className="sheet-foot">
          <button className="btn" type="button" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" type="button" disabled={isSavingRecord} onClick={onSave}>
            {isSavingRecord ? '保存中…' : '保存'}
          </button>
        </footer>
      </section>
    </div>
  )
}