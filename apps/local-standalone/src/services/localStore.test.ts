import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from './backup'
import { deleteDayRecord, loadDayOverrides, saveDayRecord } from './dayRecords'
import { isLocalPersistenceAvailable, readLocalDayRecords } from './localStore'
import { loadSalaryInputs, saveSalaryInput } from './salaryInputs'

/**
 * 本地数据层的往返测试。
 *
 * 这个项目不联网，所以「存进去能不能读出来」是唯一的持久化保证，
 * 这里用一份内存版 localStorage 把整条链路跑一遍。
 */

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    }
  } as Storage
}

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: createMemoryStorage()
  }
})

describe('本地排班记录', () => {
  it('保存后能读回覆盖表', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班', overtimeHours: 2 })

    const overrides = await loadDayOverrides()
    expect(overrides.shiftOverrides['华文达::10/05']).toBe('夜班')
    expect(overrides.overtimeOverrides['华文达::10/05']).toBe(2)
  })

  it('同一天重复保存会覆盖而不是追加', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班' })
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '白班' })

    expect(readLocalDayRecords()).toHaveLength(1)
    expect(readLocalDayRecords()[0].shiftOverride).toBe('白班')
  })

  it('删除后记录不再存在', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班' })
    await deleteDayRecord('华文达', '10/05')

    expect(readLocalDayRecords()).toHaveLength(0)
  })

  it('保存一条没有任何有效内容的记录等于删除它', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班' })
    await saveDayRecord({ personName: '华文达', date: '10/05', overtimeHours: 0 })

    expect(readLocalDayRecords()).toHaveLength(0)
  })

  it('只记录事假时长，非法时长被丢弃', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '事假', leaveDuration: '半天' })
    expect((await loadDayOverrides()).leaveDurationOverrides['华文达::10/05']).toBe('半天')

    await saveDayRecord({ personName: '华文达', date: '10/06', shiftOverride: '白班', leaveDuration: '半天' })
    expect((await loadDayOverrides()).leaveDurationOverrides['华文达::10/06']).toBeUndefined()
  })
})

describe('localStorage 不可用时的兜底', () => {
  it('没有 window.localStorage 时不抛错，数据退化为内存保存', async () => {
    ;(globalThis as unknown as { window: unknown }).window = {}

    expect(isLocalPersistenceAvailable()).toBe(false)

    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班' })
    expect(readLocalDayRecords()).toHaveLength(1)
  })
})

describe('薪资输入', () => {
  it('能保存并读回', async () => {
    await saveSalaryInput('华文达::10', {
      baseSalary: '4350',
      performanceAllowance: '500',
      positionAllowance: '300',
      otherDeductions: '120'
    })

    expect((await loadSalaryInputs())['华文达::10']).toEqual({
      baseSalary: '4350',
      performanceAllowance: '500',
      positionAllowance: '300',
      otherDeductions: '120'
    })
  })
})

describe('备份与恢复', () => {
  it('导出的备份能完整恢复（含覆盖现有数据）', async () => {
    await saveDayRecord({ personName: '华文达', date: '10/05', shiftOverride: '夜班', overtimeHours: 1.5 })
    await saveDayRecord({ personName: '李四', date: '10/06', shiftOverride: '事假', leaveDuration: '半天' })
    await saveSalaryInput('华文达::10', {
      baseSalary: '4350',
      performanceAllowance: '',
      positionAllowance: '',
      otherDeductions: ''
    })

    const backupText = JSON.stringify(createBackup())

    // 清空本机数据，模拟换设备
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: createMemoryStorage()
    }
    expect(readLocalDayRecords()).toHaveLength(0)

    const result = restoreBackup(backupText)
    expect(result).toEqual({ dayRecords: 2, salaryInputs: 1 })

    const overrides = await loadDayOverrides()
    expect(overrides.shiftOverrides['华文达::10/05']).toBe('夜班')
    expect(overrides.overtimeOverrides['华文达::10/05']).toBe(1.5)
    expect(overrides.shiftOverrides['李四::10/06']).toBe('事假')
    expect(overrides.leaveDurationOverrides['李四::10/06']).toBe('半天')
    expect((await loadSalaryInputs())['华文达::10'].baseSalary).toBe('4350')
  })

  it('导入别的应用的备份会被拒绝', () => {
    expect(() => restoreBackup(JSON.stringify({ app: 'other-app', dayRecords: [] })))
      .toThrow('不是「倒班表 · 本地版」导出的')
  })

  it('导入非 JSON 会被拒绝', () => {
    expect(() => restoreBackup('not json')).toThrow('不是合法的 JSON')
  })

  it('导入没有数据的备份会被拒绝', () => {
    expect(() => restoreBackup(JSON.stringify({ app: 'shift-schedule-local', dayRecords: [] })))
      .toThrow('没有可恢复的数据')
  })

  it('兼容顶层就是记录数组的宽松格式', () => {
    const result = restoreBackup(JSON.stringify([
      { personName: '华文达', date: '10/05', shiftOverride: '夜班' }
    ]))

    expect(result.dayRecords).toBe(1)
    expect(readLocalDayRecords()[0].shiftOverride).toBe('夜班')
  })
})
