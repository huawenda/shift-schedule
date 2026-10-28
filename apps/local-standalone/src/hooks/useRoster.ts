import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyDayRecord,
  applySelf,
  applyShiftEdit,
  findMember,
  isRosterEmpty,
  loadRoster,
  removePattern,
  restoreDay,
  saveRoster,
  saveSalary as applySalary,
  upsertPattern,
  type DayRecordInput,
  type Member,
  type Roster
} from '../data/roster'
import type { CustomPattern } from '../data/patterns'
import type { SalaryInput, SelfIdentity } from '../data/profile'
import { isPersistenceAvailable } from '../data/storage'
import type { ShiftType } from '../data/shifts'

/**
 * 花名册状态与持久化。
 *
 * 所有写操作都是纯 state 更新，落盘由 useEffect 统一做一次，
 * 存盘失败（隐私模式 / file:// 限制）时把 persisted 置 false，界面顶部给提示。
 */

export interface RosterApi {
  roster: Roster
  persisted: boolean
  isEmpty: boolean
  editShift: (memberId: string, date: string, shift: ShiftType | null) => void
  /** 写整天内容（班次 + 加班 + 法定），日历弹层用 */
  saveDay: (memberId: string, date: string, input: DayRecordInput) => void
  /** 恢复默认：删掉这一天的整条记录 */
  resetDay: (memberId: string, date: string) => void
  replaceRoster: (roster: Roster) => void
  replaceMembers: (members: Member[]) => void
  savePattern: (pattern: CustomPattern) => void
  removePatternById: (patternId: string) => void
  /** 设置 / 修改本人身份；改动时会清空该人的考勤与薪资（数据层保证） */
  saveSelf: (input: SelfIdentity) => void
  /** 只改薪资，不碰身份 */
  saveSalary: (salary: SalaryInput) => void
}

export function useRoster(): RosterApi {
  const [roster, setRoster] = useState<Roster>(() => loadRoster())
  const [persisted, setPersisted] = useState(() => isPersistenceAvailable())
  const bootedRef = useRef(false)

  useEffect(() => {
    if (!bootedRef.current) {
      bootedRef.current = true
      return
    }
    if (!saveRoster(roster)) setPersisted(false)
  }, [roster])

  const editShift = useCallback((memberId: string, date: string, shift: ShiftType | null) => {
    setRoster(current => applyShiftEdit(current, memberId, date, shift))
  }, [])

  const saveDay = useCallback((memberId: string, date: string, input: DayRecordInput) => {
    setRoster(current => applyDayRecord(current, memberId, date, input))
  }, [])

  const resetDay = useCallback((memberId: string, date: string) => {
    setRoster(current => restoreDay(current, memberId, date))
  }, [])

  const replaceRoster = useCallback((next: Roster) => {
    setRoster({ ...next, updatedAt: Date.now() })
  }, [])

  /**
   * 整表替换成员（设置页保存用）：保留仍然存在的成员的改班记录。
   *
   * **本人那一行的姓名与班序强制沿用当前值** —— 成员表里它是只读的，
   * 这里再兜一层，保证「改本人 = 换人 + 清空」只能走 `saveSelf` 那条路，
   * 不会因为将来某个界面漏了只读而静默改名、把清空逻辑绕过去。
   */
  const replaceMembers = useCallback((members: Member[]) => {
    setRoster(current => {
      const self = current.profile ? findMember(current, current.profile.memberId) : undefined
      const guarded = self
        ? members.map(member =>
          member.id === self.id ? { ...member, name: self.name, patternId: self.patternId } : member
        )
        : members

      const ids = new Set(guarded.map(member => member.id))
      return {
        ...current,
        members: guarded,
        overrides: current.overrides.filter(override => ids.has(override.memberId)),
        updatedAt: Date.now()
      }
    })
  }, [])

  /** 新建或更新一条自定义班序（按 id 判断） */
  const savePattern = useCallback((pattern: CustomPattern) => {
    setRoster(current => upsertPattern(current, pattern))
  }, [])

  /** 删除一条自定义班序，连带删除挂在上面的成员与其改班记录（内置由数据层拒绝） */
  const removePatternById = useCallback((patternId: string) => {
    setRoster(current => removePattern(current, patternId).roster)
  }, [])

  const saveSelf = useCallback((input: SelfIdentity) => {
    setRoster(current => applySelf(current, input).roster)
  }, [])

  const saveSalary = useCallback((salary: SalaryInput) => {
    setRoster(current => applySalary(current, salary))
  }, [])

  return {
    roster,
    persisted,
    isEmpty: isRosterEmpty(roster),
    editShift,
    saveDay,
    resetDay,
    replaceRoster,
    replaceMembers,
    savePattern,
    removePatternById,
    saveSelf,
    saveSalary
  }
}
