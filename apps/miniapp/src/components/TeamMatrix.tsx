import { ScrollView, Text, View } from '@tarojs/components'
import { getMarkClass, shiftInitial } from '../appConstants'
import { getOverrideKey } from '../services/cloudRecordMaps'
import type { SchedulePerson } from '../types/schedule'
import type { DateLabel } from '../utils/schedule'

export type MatrixMode = 'shift' | 'name'

interface Props {
  people: SchedulePerson[]
  dates: string[]
  dateLabels: DateLabel[]
  mode: MatrixMode
  currentUserName: string
  todayKey: string
  overtimeKeys: Set<string>
  legalKeys: Set<string>
  onOpen: (personName: string, date: string) => void
  onModeChange: (mode: MatrixMode) => void
}

/**
 * 全员排班矩阵（按新设计语言重建）。
 *
 * 与旧版的结构差异：
 * 1. 班次不再是深色实心块，改成浅底 + 深字的徽章（m-* 系列），
 *    与日历格一致，整片看上去是「浅色网格 + 少量彩色标记」而不是彩色马赛克。
 * 2. 加班/法定标记缩成右上角小圆点，不再叠在白点上。
 * 3. 当前用户整行高亮：左侧姓名加粗变蓝，行底色极浅。
 *
 * 保留的关键约束（旧版踩过坑）：
 * - 左侧姓名列是独立 View，与右侧 ScrollView 分离，所以**表头与内容的列宽
 *   必须同时切换**（按班次 38 / 按姓名 56），否则第 2 列就开始错位。
 * - 行高必须一致：表头 34，数据行 36 + 3 间距（两侧同步改）。
 * - 定位今天列用 ScrollView 自带的 scroll-into-view（表头 today 列带 id），
 *   不做任何几何估算——估算常量必然漂移（Round 2 审计 #4 的教训）。
 */
export default function TeamMatrix({
  people,
  dates,
  dateLabels,
  mode,
  currentUserName,
  todayKey,
  overtimeKeys,
  legalKeys,
  onOpen,
  onModeChange
}: Props) {
  const byName = mode === 'name'

  return (
    <View className={`matrix ${byName ? 'is-by-name' : ''}`}>
      <View className="mx-head">
        <View className="mx-title">
          <Text className="mx-title-text">全员排班</Text>
          <Text className="mx-title-sub">{people.length} 人 · {dates.length} 天</Text>
        </View>
        <View className="seg">
          <View
            className={`seg-item ${!byName ? 'is-on' : ''}`}
            hoverClass="press-dim"
            onClick={() => onModeChange('shift')}
          >
            <Text>按班次</Text>
          </View>
          <View
            className={`seg-item ${byName ? 'is-on' : ''}`}
            hoverClass="press-dim"
            onClick={() => onModeChange('name')}
          >
            <Text>按姓名</Text>
          </View>
        </View>
      </View>

      <View className="mx-card">
        <View className="mx-col">
          <View className="mx-name mx-name-head">
            <Text>{byName ? '班次' : '姓名'}</Text>
          </View>
          {people.map(person => (
            <View
              key={person.name}
              className={`mx-name ${person.name === currentUserName ? 'is-me' : ''}`}
            >
              <Text className="mx-name-main">{byName ? person.group : person.name}</Text>
              {byName ? null : <Text className="mx-name-sub">{person.group}</Text>}
            </View>
          ))}
        </View>

        <ScrollView
          scrollX
          enhanced
          showScrollbar={false}
          className="mx-scroll"
          scrollIntoView="mx-today"
        >
          <View>
            <View className="mx-row mx-row-head">
              {dateLabels.map(label => (
                <View
                  key={label.date}
                  id={label.date === todayKey ? 'mx-today' : undefined}
                  className={`mx-gh ${label.date === todayKey ? 'is-today' : ''}`}
                >
                  <Text>{label.date.slice(3)}</Text>
                </View>
              ))}
            </View>

            {people.map(person => (
              <View
                key={person.name}
                className={`mx-row ${person.name === currentUserName ? 'is-me' : ''}`}
              >
                {dates.map((date, index) => {
                  const shift = person.shifts[index]
                  const key = getOverrideKey(person.name, date)
                  const hasLegal = legalKeys.has(key)
                  const hasOvertime = shift !== '事假' && (hasLegal || overtimeKeys.has(key))

                    return (
                      <View
                        key={date}
                        className={`mx-cell ${date === todayKey ? 'is-today' : ''}`}
                        hoverClass="press-cell"
                        onClick={() => onOpen(person.name, date)}
                      >
                      {shift ? (
                        <View className={`mx-mark ${getMarkClass(shift)}`}>
                          <Text>{byName ? person.name : shiftInitial[shift]}</Text>
                        </View>
                      ) : null}
                      {hasOvertime ? (
                        <View className={`mx-dot ${hasLegal ? 'is-legal' : ''}`} />
                      ) : null}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}
