import { Input, ScrollView, Text, View } from '@tarojs/components'
import { getMarkClass, leaveDurationOptions } from '../appConstants'
import type { LeaveDuration, ShiftType } from '../types/schedule'
import { canMarkLegalShift } from '../utils/legalOvertime'
import { normalizeOvertimeHours } from '../utils/schedule'
import { getEditableShiftOptionsForBase, getOvertimePresetOptions } from '../utils/shiftEditRules'
import type { ShiftDraft } from '../hooks/useScheduleData'

interface Props {
  draft: ShiftDraft
  isAdmin: boolean
  onChange: (draft: ShiftDraft) => void
  onCancel: () => void
  onSave: () => void
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/**
 * 改班弹层（重写）。
 *
 * 与旧版的差别：不再用「色块选项」表达班次（旧版一排彩色方块，选中态靠描边，
 * 在深色/浅色底上都难分辨），改成文字 chip + 选中态实心品牌蓝，
 * 与整页的卡片语言一致。
 */
export default function ShiftEditor({ draft, onChange, onCancel, onSave }: Props) {
  const effective = draft.selectedShift === 'default' ? draft.baseShift : draft.selectedShift
  const shiftOptions = getEditableShiftOptionsForBase(draft.baseShift)
  const overtimePresets = getOvertimePresetOptions(effective, draft.isLegal)
  const canLegal = canMarkLegalShift(effective)

  function selectShift(next: ShiftType | 'default') {
    const resolved = next === 'default' ? draft.baseShift : next
    onChange({
      ...draft,
      selectedShift: next,
      isLegal: canMarkLegalShift(resolved) ? draft.isLegal : false,
      leaveDuration: resolved === '事假' ? draft.leaveDuration : '一天'
    })
  }

  return (
    <View className="dlg-mask" onClick={onCancel}>
      <View className="dlg" onClick={event => event.stopPropagation()}>
        <View className="dlg-head">
          <Text className="dlg-title">{draft.date}</Text>
          <Text className="dlg-sub">{draft.personName} · 当前 {effective}</Text>
        </View>

        <ScrollView scrollY className="dlg-body" enhanced showScrollbar={false}>
          <Text className="dlg-label">班次</Text>
          <View className="chips">
            <View
              className={`chip ${draft.selectedShift === 'default' ? 'is-on' : ''}`}
              hoverClass="press-surface"
              onClick={() => selectShift('default')}
            >
              <Text>默认（{draft.baseShift}）</Text>
            </View>
            {shiftOptions.map(shift => (
              <View
                key={shift}
                className={`chip ${getMarkClass(shift)} ${draft.selectedShift === shift ? 'is-on' : ''}`}
                hoverClass="press-surface"
                onClick={() => selectShift(shift)}
              >
                <Text>{shift}</Text>
              </View>
            ))}
          </View>

          {effective === '事假' ? (
            <>
              <Text className="dlg-label">事假时长</Text>
              <View className="chips">
                {leaveDurationOptions.map(duration => (
                  <View
                    key={duration}
                    className={`chip ${draft.leaveDuration === duration ? 'is-on' : ''}`}
                    hoverClass="press-surface"
                    onClick={() => onChange({ ...draft, leaveDuration: duration as LeaveDuration })}
                  >
                    <Text>{duration}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {canLegal ? (
            <>
              <Text className="dlg-label">法定加班</Text>
              <View className="chips">
                <View
                  className={`chip ${!draft.isLegal ? 'is-on' : ''}`}
                  hoverClass="press-surface"
                  onClick={() => onChange({ ...draft, isLegal: false })}
                >
                  <Text>否</Text>
                </View>
                <View
                  className={`chip ${draft.isLegal ? 'is-on' : ''}`}
                  hoverClass="press-surface"
                  onClick={() => onChange({ ...draft, isLegal: true })}
                >
                  <Text>是</Text>
                </View>
              </View>
            </>
          ) : null}

          {overtimePresets.length > 0 ? (
            <>
              <Text className="dlg-label">加班时长</Text>
              <View className="chips">
                {overtimePresets.map(hours => (
                  <View
                    key={hours}
                    className={`chip ${normalizeOvertimeHours(draft.overtimeInput) === hours ? 'is-on' : ''}`}
                    hoverClass="press-surface"
                    onClick={() => onChange({ ...draft, overtimeInput: formatHours(hours) })}
                  >
                    <Text>{formatHours(hours)}h</Text>
                  </View>
                ))}
              </View>
              <View className="hours">
                <View className="hours-box">
                  <Input
                    className="hours-input"
                    type="digit"
                    value={draft.overtimeInput}
                    placeholder="0"
                    onInput={event => onChange({ ...draft, overtimeInput: String(event.detail.value) })}
                  />
                </View>
                <Text className="hours-unit">小时 · 最小 0.5</Text>
              </View>
            </>
          ) : (
            <Text className="dlg-hint">该班次不记录加班</Text>
          )}
        </ScrollView>

        <View className="dlg-actions">
          <View className="btn-ghost" hoverClass="press-dim" onClick={onCancel}>
            <Text>取消</Text>
          </View>
          <View className="btn-primary" hoverClass="press-dim" onClick={onSave}>
            <Text>保存</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
