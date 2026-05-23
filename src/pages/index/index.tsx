import { ScrollView, Text, View } from '@tarojs/components'
import { scheduleData } from '../../data/schedule'
import { getShiftClassName } from '../../utils/shift'
import './index.scss'

const highlightedUserName = '华文达'

export default function Index() {
  const highlightedPerson = scheduleData.people.find(person => person.name === highlightedUserName)

  return (
    <View className="page">
      <View className="header">
        <Text className="title">倒班表</Text>
        <Text className="subtitle">2026/06/07 - 2026/06/30</Text>
        <Text className="desc">完整倒班周期 · MVP 版本</Text>
      </View>

      <View className="current-user-card">
        <Text>当前高亮：{highlightedPerson?.name} / {highlightedPerson?.group}</Text>
      </View>

      <ScrollView scrollX className="table-scroll" enhanced showScrollbar>
        <View className="schedule-table">
          <View className="table-row table-header">
            <View className="cell name-cell">
              <Text>姓名</Text>
            </View>
            <View className="cell group-cell">
              <Text>班次</Text>
            </View>
            {scheduleData.dates.map(date => (
              <View key={date} className="cell date-cell">
                <Text>{date}</Text>
              </View>
            ))}
          </View>

          {scheduleData.people.map(person => (
            <View
              key={person.name}
              className={`table-row ${person.name === highlightedUserName ? 'highlight-row' : ''}`}
            >
              <View className="cell name-cell">
                <Text>{person.name}</Text>
              </View>
              <View className="cell group-cell">
                <Text>{person.group}</Text>
              </View>
              {person.shifts.map((shift, index) => (
                <View key={`${person.name}-${index}`} className="cell date-cell">
                  <Text className={getShiftClassName(shift)}>{shift}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
