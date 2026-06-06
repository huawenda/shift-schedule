import {
  canMarkLegalShift,
  getEditableShiftOptionsForBase,
  getOvertimePresetOptions,
  normalizeOvertimeHours,
  type LeaveDuration,
  type ShiftType
} from '@shift-schedule/core'
import { leaveDurationOptions } from '../../appConstants'
import type { ShiftEditorState } from '../../appTypes'
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
  const effectiveShift = getEditorEffectiveShift(editor)

  return (
    <div className="editor-backdrop" role="presentation" onClick={onCancel}>
      <section className="shift-editor" role="dialog" aria-modal="true" aria-labelledby="shift-editor-title" onClick={event => event.stopPropagation()}>
        <div className="section-header">
          <div>
            <h2 id="shift-editor-title">编辑</h2>
            <span className="muted-label">{editor.personName} · {editor.date}</span>
          </div>
        </div>

        <div className="editor-group">
          <span className="editor-label">默认班次</span>
          <button className={`editor-option editor-default-shift ${editor.selectedShift === 'default' ? 'active' : ''}`} type="button" onClick={() => onShiftChange('default')}>
            <span className={`shift-chip ${getShiftClassName(editor.baseShift)}`}>{editor.baseShift}</span>
          </button>
        </div>

        <div className="editor-group">
          <span className="editor-label">修改为</span>
          <div className="editor-options">
            {getEditableShiftOptionsForBase(editor.baseShift).map(shift => {
              const isDisabled = editor.isLegal && shift === '事假'

              return (
                <button
                  className={`editor-option ${effectiveShift === shift ? 'active' : ''}`}
                  disabled={isDisabled}
                  key={shift}
                  type="button"
                  onClick={() => onShiftChange(shift === editor.baseShift ? 'default' : shift)}
                >
                  <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                </button>
              )
            })}
          </div>
        </div>

        {effectiveShift === '事假' ? (
          <div className="editor-group">
            <span className="editor-label">事假时长</span>
            <div className="segmented-row">
              {leaveDurationOptions.map(duration => (
                <button
                  className={editor.leaveDuration === duration ? 'active' : ''}
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

        <div className="editor-group">
          <span className="editor-label">法定</span>
          {canMarkLegalShift(effectiveShift) ? (
            <div className="segmented-row">
              <button className={!editor.isLegal ? 'active' : ''} type="button" onClick={() => onLegalChange(false)}>否</button>
              <button className={editor.isLegal ? 'active' : ''} type="button" onClick={() => onLegalChange(true)}>是</button>
            </div>
          ) : (
            <span className="editor-muted">该班次不可标记法定</span>
          )}
        </div>

        <div className="editor-group">
          <span className="editor-label">加班时长</span>
          {canRecordOvertime(effectiveShift) ? (
            <>
              <div className="segmented-row">
                {getOvertimePresetOptions(effectiveShift, editor.isLegal).map(hours => (
                  <button
                    className={normalizeOvertimeHours(editor.overtimeInput) === hours ? 'active' : ''}
                    key={hours}
                    type="button"
                    onClick={() => onOvertimeInputChange(formatOvertimeHours(hours))}
                  >
                    {formatOvertimeHours(hours)}h
                  </button>
                ))}
              </div>
              <label className="overtime-input-row">
                <input
                  inputMode="decimal"
                  value={editor.overtimeInput}
                  onChange={event => onOvertimeInputChange(event.target.value)}
                  placeholder="0"
                />
                <span>小时</span>
                <span className="overtime-hint">最小单位0.5</span>
              </label>
            </>
          ) : (
            <span className="editor-muted">该班次不记录加班</span>
          )}
        </div>

        <div className="editor-actions">
          <button className="primary-button" type="button" disabled={isSavingRecord} onClick={onSave}>
            {isSavingRecord ? '保存中' : '保存'}
          </button>
          <button className="ghost-button" type="button" onClick={onCancel}>取消</button>
        </div>
      </section>
    </div>
  )
}
