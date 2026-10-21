import { ScrollView, Text, View } from '@tarojs/components'
import type { SchedulePerson } from '../types/schedule'

interface Props {
  people: SchedulePerson[]
  selectedName: string
  onSelect: (name: string) => void
  onClose: () => void
}

/** 与 Web 端 .picker（AppChrome 的切换人员浮层）对齐。 */
export default function UserPickerSheet({ people, selectedName, onSelect, onClose }: Props) {
  return (
    <View className="sheet-backdrop" onClick={onClose}>
      <View className="picker" onClick={event => event.stopPropagation()}>
        <View className="picker-head">
          <Text className="picker-title">切换人员</Text>
          <Text className="sheet-sub">点空白处关闭</Text>
        </View>
        <ScrollView scrollY className="picker-list" enableFlex enhanced showScrollbar={false}>
          {people.map(person => (
            <View
              key={person.name}
              className={`picker-item ${person.name === selectedName ? 'is-on' : ''}`}
              onClick={() => onSelect(person.name)}
            >
              <View className="picker-name">
                <Text>{person.name}</Text>
                <Text className="picker-group"> · {person.group}</Text>
              </View>
              <View className="picker-tick" />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}