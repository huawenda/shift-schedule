/**
 * 演示数据：第一次打开（本机还没有存档）时写进花名册的一份初始数据。
 *
 * 结构与真实数据完全一致，之后所有页面都按真实规则读写它 ——
 * 它不是「假数据层」，只是初始值。
 *
 * 重点：记录只用合法组合（休息 / 事假不记加班），否则归一化会把它们清掉。
 */

import type { DayOverride, Member, Roster } from './roster/model'

const MEMBERS: Member[] = [
  { id: 'm-01', name: '华文达', patternId: '4F', position: 'PNP' },
  { id: 'm-02', name: '张舒棋', patternId: '4G', position: 'PNP' },
  { id: 'm-03', name: '陈泳智', patternId: '4H', position: 'PNP' },
  { id: 'm-04', name: '韩义博', patternId: '4I', position: '班长' },
  { id: 'm-05', name: '段志彬', patternId: '4J', position: 'PNP' },
  { id: 'm-06', name: '余昌耿', patternId: '4K', position: 'PNP' },
  { id: 'm-07', name: '张涛', patternId: '4R', position: 'PNP' },
  { id: 'm-08', name: '谢懋', patternId: '4S', position: 'PNP' },
  { id: 'm-09', name: '农伟俊', patternId: '4T', position: 'PNP' },
  { id: 'm-10', name: '帅长安', patternId: '4U', position: 'PNP' },
  { id: 'm-11', name: '林泽勇', patternId: '4V', position: '副班长' },
  { id: 'm-12', name: '陈家辉', patternId: '4W', position: 'PNP' },
  { id: 'm-13', name: '张增全', patternId: '4X', position: 'PNP' }
]

/** 本人当期的临时记录：加班 / 法定 / 事假 / 换班 */
const OVERRIDES: DayOverride[] = [
  { memberId: 'm-01', date: '2026-11-01', shift: '夜班', overtimeHours: 2 },
  { memberId: 'm-01', date: '2026-11-05', shift: '夜班', overtimeHours: 3, isLegal: true },
  { memberId: 'm-01', date: '2026-11-06', shift: '休息', isLegal: true },
  { memberId: 'm-01', date: '2026-11-11', shift: '白班', overtimeHours: 1.5 },
  { memberId: 'm-01', date: '2026-11-12', shift: '事假', leaveDuration: '4h' },
  { memberId: 'm-01', date: '2026-11-16', shift: '白特', overtimeHours: 10 }
]

export function seedRoster(): Roster {
  return {
    members: MEMBERS.map(member => ({ ...member })),
    overrides: OVERRIDES.map(override => ({ ...override })),
    patterns: [
      {
        id: 'cp-1',
        name: '甲班',
        shifts: Array.from('白白白白休休夜夜夜夜休休白白白白休休夜夜夜夜休休').map(char => {
          if (char === '白') return '白班'
          if (char === '夜') return '夜班'
          return '休息'
        }) as Roster['patterns'][number]['shifts']
      }
    ],
    todos: [
      { id: 't-1', date: '2026-11-01', text: '交班前检查配电柜', tone: 1, done: false, createdAt: 1 },
      { id: 't-2', date: '2026-11-09', text: '领取下月劳保用品', tone: 3, done: true, createdAt: 2 },
      { id: 't-3', date: '2026-11-09', text: '和班长确认调休', tone: 5, done: false, createdAt: 3 },
      { id: 't-4', date: '2026-11-16', text: '提交月度考勤表', tone: 4, done: false, createdAt: 4 }
    ],
    profile: {
      memberId: 'm-01',
      salary: {
        baseSalary: '3982',
        performanceAllowance: '1300',
        positionAllowance: '1000',
        socialFund: '1600'
      }
    },
    updatedAt: Date.now()
  }
}
