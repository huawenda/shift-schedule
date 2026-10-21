import { ScrollView, Text, View } from '@tarojs/components'
import { getOverrideKey } from '../services/cloudRecordMaps'
import { getShiftClass } from '../appConstants'
import type { SchedulePerson, ShiftType } from '../types/schedule'
import type { DateLabel } from '../utils/schedule'
import ShiftMark from './ShiftMark'

export type TableMode = 'shift' | 'name'

interface Props {
  people: SchedulePerson[]
  dates: string[]
  shiftsByPerson: Record<string, ShiftType[]>
  dateLabels: DateLabel[]
  mode: TableMode
  currentPersonName: string
  todayKey: string
  overtimeKeys: Set<string>
  legalKeys: Set<string>
  scrollLeft?: number
  onScroll?: (scrollLeft: number) => void
  onOpenShiftEditor: (date: string, personName: string) => void
  onModeChange: (mode: TableMode) => void
}

/** 与 Web 端 TeamMatrix.tsx 对应；左侧姓名列用独立 View 固定，右侧横向滚动。 */
export default function TeamMatrix({
  people,
  dates,
  shiftsByPerson,
  dateLabels,
  mode,
  currentPersonName,
  todayKey,
  overtimeKeys,
  legalKeys,
  scrollLeft,
  onScroll,
  onOpenShiftEditor,
  onModeChange
}: Props) {
  const byName = mode === 'name'
  const weekdayOrder = ['日', '六']

  return (
    <View className={`matrix ${byName ? 'is-by-name' : ''}`}>
      <View className="matrix-head">
        <View className="matrix-title">
          <Text className="sec-title">全员排班</Text>
          <Text className="sec-sub matrix-title-sub">
            {people.length} 人 · {dates.length} 天
          </Text>
        </View>
        <View className="tabs">
          <Text
            className={`tab ${!byName ? 'is-active' : ''}`}
            onClick={() => onModeChange('shift')}
          >
            按班次
          </Text>
          <Text
            className={`tab ${byName ? 'is-active' : ''}`}
            onClick={() => onModeChange('name')}
          >
            按姓名
          </Text>
        </View>
      </View>

      <View className="matrix-shell">
        <View className="matrix-names">
          <View className="mn mn-head">
            <Text className="mn-head-label">{byName ? '班次' : '姓名'}</Text>
          </View>
          {people.map(person => (
            <View key={person.name} className={`mn ${person.name === currentPersonName ? 'is-me' : ''}`}>
              {byName ? null : <Text className="mn-name">{person.name}</Text>}
              <Text className={byName ? 'mn-group-solo' : 'mn-group'}>{person.group}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          scrollX
          enhanced
          showScrollbar={false}
          className="matrix-scroll"
          scrollLeft={scrollLeft}
          onScroll={
            onScroll ? event => onScroll(Number(event.detail.scrollLeft) || 0) : undefined
          }
        >
          <View>
            <View className="mr mr-head">
              {dateLabels.map(label => (
                <View
                  key={label.date}
                  className={`gh ${weekdayOrder.includes(label.weekday) ? 'we' : ''}${
                    label.date === todayKey ? ' today' : ''
                  }`}
                >
                  <Text>{label.date.slice(3)}</Text>
                </View>
              ))}
            </View>

            {people.map(person => {
              const shifts = shiftsByPerson[person.name] ?? []

              return (
                <View key={person.name} className="mr">
                  {dates.map((date, index) => {
                    const shift = shifts[index]
                    const key = getOverrideKey(person.name, date)
                    const hasOvertime = overtimeKeys.has(key)
                    const hasLegal = legalKeys.has(key)

                    return (
                      <View
                        key={date}
                        className={[
                          'm-body',
                          byName ? 'is-name' : '',
                          !byName && shift === '休息' ? 'is-blank' : '',
                          hasOvertime ? 'is-edited' : '',
                          hasLegal && hasOvertime ? 'is-legal' : '',
                          !shift ? 'is-empty' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onOpenShiftEditor(date, person.name)}
                      >
                        {hasOvertime ? (
                          <View className={`mark-dot ${hasLegal ? 'mark-dot-legal' : 'mark-dot-ot'}`} />
                        ) : null}
                        {shift ? (
                          byName ? (
                            <View className={`name-pill ${getShiftClass(shift)}`}>
                              <Text>{person.name}</Text>
                            </View>
                          ) : (
                            <ShiftMark shift={shift} />
                          )
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </ScrollView>
      </View>

      <View className="matrix-foot">
        <Text className="scroll-hint">左滑看更多日期</Text>
      </View>
    </View>
  )
}