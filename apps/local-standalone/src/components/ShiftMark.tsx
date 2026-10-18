import type { ShiftType } from '@local/core'
import { getShiftClass } from '../scheduleHelpers'

/** 班次色块：两字班次横排显示（含「休息」）。 */
export function ShiftMark({ shift }: { shift: ShiftType }) {
  const chars = Array.from(shift)

  return (
    <span className={`shift-block ${getShiftClass(shift)}`} aria-hidden="true">
      {chars.map((char, index) => (
        <span key={`${char}-${index}`}>{char}</span>
      ))}
    </span>
  )
}
