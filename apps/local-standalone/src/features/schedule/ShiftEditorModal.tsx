import {
  canMarkLegalShift,
  getEditableShiftOptionsForBase,
  getOvertimePresetOptions,
  normalizeOvertimeHours,
  type LeaveDuration,
  type ShiftType
} from '@local/core'
import { leaveDurationOptions, shiftInitial } from '../../appConstants'
import type { ShiftEditorState } from '../../appTypes'
import { useDialog } from '../../hooks/useDialog'
import {
  canRecordOvertime,
  formatOvertimeHours,
  getEditorEffectiveShift,
  getShiftClass
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
    <div className="sheet-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="shift-editor-title"
        aria-modal="true"
        className="sheet"
        role="dialog"
        ref={sheetRef}
        onClick={event => event.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <h2 id="shift-editor-title">改班</h2>
            <p className="sub">{editor.personName} · {editor.date}</p>
          </div>
          <span className="sub">点空白处关闭</span>
        </header>

        <div className="sheet-body">
          <div className="field-group">
            <span className="label">默认班次</span>
            <div className="choice-row">
              <button
                aria-label={editor.baseShift}
                aria-pressed={editor.selectedShift === 'default'}
                className="shift-choice"
                data-role="base"
                title={editor.baseShift}
                type="button"
                onClick={() => onShiftChange('default')}
              >
                <span className={`shift-block ${getShiftClass(editor.baseShift)}`}>
                  <span>{shiftInitial[editor.baseShift]}</span>
                </span>
              </button>
            </div>
          </div>

          <div className="field-group">
            <span className="label">修改为</span>
            <div className="choice-row">
              {getEditableShiftOptionsForBase(editor.baseShift).map(shift => (
                <button
                  aria-label={shift}
                  aria-pressed={effectiveShift === shift}
                  className="shift-choice"
                  key={shift}
                  title={shift}
                  type="button"
                  onClick={() => onShiftChange(shift === editor.baseShift ? 'default' : shift)}
                >
                  <span className={`shift-block ${getShiftClass(shift)}`}>
                    <span>{shiftInitial[shift]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {effectiveShift === '事假' ? (
            <div className="field-group">
              <span className="label">事假时长</span>
              <div className="choice-row">
                {leaveDurationOptions.map(duration => (
                  <button
                    aria-pressed={editor.leaveDuration === duration}
                    key={duration}
                    type="button"
                    onClick={() => onLeaveDurationChange(duration)}
                  >
                    {duration}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="field-group">
            <span className="label">法定</span>
            {canMarkLegalShift(effectiveShift) ? (
              <div className="choice-row">
                <button aria-pressed={!editor.isLegal} type="button" onClick={() => onLegalChange(false)}>
                  否
                </button>
                <button aria-pressed={editor.isLegal} type="button" onClick={() => onLegalChange(true)}>
                  是
                </button>
              </div>
            ) : (
              <p className="hint">该班次不可标记法定</p>
            )}
          </div>

          <div className="field-group">
            <span className="label">加班时长</span>
            {canRecordOvertime(effectiveShift) ? (
              <>
                <div className="choice-row">
                  {getOvertimePresetOptions(effectiveShift, editor.isLegal).map(hours => (
                    <button
                      aria-pressed={normalizeOvertimeHours(editor.overtimeInput) === hours}
                      key={hours}
                      type="button"
                      onClick={() => onOvertimeInputChange(formatOvertimeHours(hours))}
                    >
                      {formatOvertimeHours(hours)}h
                    </button>
                  ))}
                </div>
                <label className="hours-input">
                  <input
                    autoComplete="off"
                    inputMode="decimal"
                    min="0"
                    name="overtimeHours"
                    placeholder="0"
                    step="0.5"
                    type="number"
                    value={editor.overtimeInput}
                    onChange={event => onOvertimeInputChange(event.target.value)}
                  />
                  <span className="hint">小时 · 最小单位 0.5</span>
                </label>
              </>
            ) : (
              <p className="hint">该班次不记录加班</p>
            )}
          </div>
        </div>

        <div className="sheet-actions">
          <button className="save" type="button" disabled={isSavingRecord} onClick={onSave}>
            {isSavingRecord ? '保存中…' : '保存'}
          </button>
          <button className="cancel" type="button" onClick={onCancel}>取消</button>
        </div>
      </section>
    </div>
  )
}
