import { Text, View } from '@tarojs/components'
import { getShiftClass } from '../appConstants'
import type { ShiftType } from '../types/schedule'

interface Props {
  shift: ShiftType
}

/** 与 Web 端 ShiftMark.tsx 一致：逐字渲染班次牌面。 */
export default function ShiftMark({ shift }: Props) {
  return (
    <View className={`shift-block ${getShiftClass(shift)}`}>
      {Array.from(shift).map((char, index) => (
        <Text key={`${char}-${index}`}>{char}</Text>
      ))}
    </View>
  )
}