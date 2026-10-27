import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyShiftEdit,
  isRosterEmpty,
  loadRoster,
  removePattern,
  saveRoster,
  upsertPattern,
  type Member,
  type Roster
} from '../data/roster'
import type { CustomPattern } from '../data/patterns'
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
  replaceRoster: (roster: Roster) => void
  replaceMembers: (members: Member[]) => void
  savePattern: (pattern: CustomPattern) => void
  removePatternById: (patternId: string) => void
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

  const replaceRoster = useCallback((next: Roster) => {
    setRoster({ ...next, updatedAt: Date.now() })
  }, [])

  /** 整表替换成员（设置页保存用）：保留仍然存在的成员的改班记录 */
  const replaceMembers = useCallback((members: Member[]) => {
    setRoster(current => {
      const ids = new Set(members.map(member => member.id))
      return {
        ...current,
        members,
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

  return {
    roster,
    persisted,
    isEmpty: isRosterEmpty(roster),
    editShift,
    replaceRoster,
    replaceMembers,
    savePattern,
    removePatternById
  }
}
