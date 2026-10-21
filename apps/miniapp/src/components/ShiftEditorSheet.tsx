import { Input, ScrollView, Text, View } from '@tarojs/components'
import { getShiftClass, leaveDurationOptions } from '../appConstants'
import type { LeaveDuration, ShiftType } from '../types/schedule'
import { canMarkLegalShift } from '../utils/legalOvertime'
import { normalizeOvertimeHours } from '../utils/schedule'
import ShiftMark from './ShiftMark'

export interface ShiftEditorState {
  personName: string
  date: string
  baseShift: ShiftType
  selectedShift: ShiftType | 'default'
  overtimeInput: string
  isLegal: boolean
  leaveDuration: LeaveDuration
}

interface Props {
  editor: ShiftEditorState
  editableOptions: ShiftType[]
  leaveOptions: boolean
  overtimePresets: number[]
  isSaving: boolean
  onSelectShift: (shift: ShiftType | 'default') => void
  onSelectLeaveDuration: (duration: LeaveDuration) => void
  onSelectLegal: (isLegal: boolean) => void
  onOvertimeInput: (value: string) => void
  onSave: () => void
  onClose: () => void
}

function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/** 与 Web 端 ShiftEditorModal.tsx 对应的改班浮层。 */
export default function ShiftEditorSheet({
  editor,
  editableOptions,
  leaveOptions,
  overtimePresets,
  isSaving,
  onSelectShift,
  onSelectLeaveDuration,
  onSelectLegal,
  onOvertimeInput,
  onSave,
  onClose
}: Props) {
  const effectiveShift = editor.selectedShift === 'default' ? editor.baseShift : editor.selectedShift

  return (
    <View className="sheet-backdrop" onClick={onClose}>
      <View className="sheet" onClick={event => event.stopPropagation()}>
        <View className="sheet-head">
          <Text className="sheet-title">改班</Text>
          <Text className="sheet-sub">
            {editor.personName} · {editor.date}
          </Text>
        </View>

        <ScrollView scrollY className="sheet-body sheet-scroll" enableFlex enhanced showScrollbar={false}>
          <View className="field-group">
            <Text className="label">默认班次</Text>
            <View className="choice-row">
              <View
                className={`choice shift-choice ${editor.selectedShift === 'default' ? 'is-on' : ''}`}
                onClick={() => onSelectShift('default')}
              >
                <ShiftMark shift={editor.baseShift} />
              </View>
            </View>
          </View>

          <View className="field-group">
            <Text className="label">修改为</Text>
            <View className="choice-row">
              {editableOptions.map(shift => (
                <View
                  key={shift}
                  className={`choice shift-choice ${editor.selectedShift === shift ? 'is-on' : ''}`}
                  onClick={() => onSelectShift(shift)}
                >
                  <ShiftMark shift={shift} />
                </View>
              ))}
            </View>
          </View>

          {leaveOptions ? (
            <View className="field-group">
              <Text className="label">事假时长</Text>
              <View className="choice-row">
                {leaveDurationOptions.map(duration => (
                  <View
                    key={duration}
                    className={`choice ${editor.leaveDuration === duration ? 'is-on' : ''}`}
                    onClick={() => onSelectLeaveDuration(duration)}
                  >
                    <Text>{duration}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View className="field-group">
            <Text className="label">法定</Text>
            {canMarkLegalShift(effectiveShift) ? (
              <View className="choice-row">
                <View
                  className={`choice ${!editor.isLegal ? 'is-on' : ''}`}
                  onClick={() => onSelectLegal(false)}
                >
                  <Text>否</Text>
                </View>
                <View
                  className={`choice ${editor.isLegal ? 'is-on' : ''}`}
                  onClick={() => onSelectLegal(true)}
                >
                  <Text>是</Text>
                </View>
              </View>
            ) : (
              <Text className="hint">该班次不可标记法定</Text>
            )}
          </View>

          <View className="field-group">
            <Text className="label">加班时长</Text>
            {overtimePresets.length > 0 ? (
              <View>
                <View className="choice-row">
                  {overtimePresets.map(hours => (
                    <View
                      key={hours}
                      className={`choice ${
                        normalizeOvertimeHours(editor.overtimeInput) === hours ? 'is-on' : ''
                      }`}
                      onClick={() => onOvertimeInput(formatOvertimeHours(hours))}
                    >
                      <Text>{formatOvertimeHours(hours)}h</Text>
                    </View>
                  ))}
                </View>
                <View className="hours-input">
                  <View className="hours-field">
                    <Input
                      className="hours-input-el"
                      type="digit"
                      value={editor.overtimeInput}
                      placeholder="0"
                      onInput={event => onOvertimeInput(String(event.detail.value))}
                    />
                  </View>
                  <Text className="hours-unit">小时 · 最小单位 0.5</Text>
                </View>
              </View>
            ) : (
              <Text className="hint">该班次不记录加班</Text>
            )}
          </View>

          <View className="hint field-group">
            <Text>当前班次 {effectiveShift}</Text>
            <View className={`swatch ${getShiftClass(effectiveShift)}`} />
          </View>
        </ScrollView>

        <View className="sheet-actions">
          <View
            className={`sheet-save ${isSaving ? 'is-disabled' : ''}`}
            onClick={() => !isSaving && onSave()}
          >
            <Text>{isSaving ? '保存中…' : '保存'}</Text>
          </View>
          <View className="sheet-cancel" onClick={onClose}>
            <Text>取消</Text>
          </View>
        </View>
      </View>
    </View>
  )
}