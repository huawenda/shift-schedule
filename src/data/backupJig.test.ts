/**
 * 备份 v6 的 JIG 段 —— 纯函数测试
 *
 * 三条要验的：
 *   1. **jig 段可选** —— 排班用户可能根本不装 JIG 数据，导出时不该硬塞
 *      一段默认配置进去；导入时缺失也不能报错。
 *   2. **只放业务配置，不放本机偏好** —— 目录、行高、开关跟着备份跑到
 *      别的机器上只会指向一个不存在的目录。
 *   3. **备份往返一致** —— 导出再导入，映射表与工序顺序原样回来。
 */

import { describe, it, expect } from 'vitest'

import { createDefaultJigConfig } from '@/features/jig/core/config'

import { BACKUP_VERSION, createBackup, parseBackup } from './backup'
import { emptyRoster, type Roster } from './roster'

const roster: Roster = {
  ...emptyRoster,
  members: [
    {
      id: 'm-1',
      name: '张三',
      patternId: '4F',
      position: '班长'
    }
  ],
  profile: {
    memberId: 'm-1',
    salary: {
      baseSalary: '6000',
      performanceAllowance: '0',
      positionAllowance: '0',
      socialFund: '0'
    }
  }
}

describe('备份 v6 的 JIG 段', () => {
  it('版本号是 6', () => {
    expect(BACKUP_VERSION).toBe(6)
    expect(createBackup(roster, null).version).toBe(6)
  })

  it('不带 JIG 配置时不写这一段', () => {
    const file = createBackup(roster, null)
    expect(file.jig).toBeUndefined()
    expect('jig' in file).toBe(false)
  })

  it('带 JIG 配置时写进去', () => {
    const jig = createDefaultJigConfig()
    const file = createBackup(roster, jig)
    expect(file.jig).toBeDefined()
    expect(file.jig?.jigSizeMapping).toEqual(jig.jigSizeMapping)
  })

  it('JIG 段只含业务配置，不含本机偏好', () => {
    const jig = createDefaultJigConfig()
    const file = createBackup(roster, jig)
    const keys = Object.keys(file.jig ?? {})

    // 本机偏好那几个字段一个都不该在里面
    expect(keys).not.toContain('sourceDir')
    expect(keys).not.toContain('exportDir')
    expect(keys).not.toContain('rowHeight')
    expect(keys).not.toContain('clipboardAutoProcessEnabled')
    expect(keys).not.toContain('exportTimestampEnabled')
  })

  it('导入时 JIG 段缺失不报错，返回 null', () => {
    const text = JSON.stringify(createBackup(roster, null))
    const result = parseBackup(text)
    expect(result.jig).toBeNull()
    expect(result.roster.members).toHaveLength(1)
  })

  it('JIG 段内容坏了不影响花名册恢复', () => {
    const text = JSON.stringify({
      ...createBackup(roster, null),
      jig: '这不是对象'
    })
    const result = parseBackup(text)
    expect(result.jig).toBeNull()
    expect(result.roster.members).toHaveLength(1)
  })

  it('备份往返：映射表与工序顺序原样回来', () => {
    const jig = {
      ...createDefaultJigConfig(),
      jigSizeMapping: { ...createDefaultJigConfig().jigSizeMapping, '999': '12/34' },
      jigSizeMappingOrder: ['999', ...createDefaultJigConfig().jigSizeMappingOrder]
    }

    const text = JSON.stringify(createBackup(roster, jig))
    const result = parseBackup(text)

    expect(result.jig).not.toBeNull()
    expect(result.jig?.jigSizeMapping['999']).toBe('12/34')
    expect(result.jig?.jigSizeMappingOrder[0]).toBe('999')
  })

  it('备份往返：工序表按并集合并（默认值打底）', () => {
    const jig = {
      ...createDefaultJigConfig(),
      engineeringConfig: {
        ...createDefaultJigConfig().engineeringConfig,
        PNP: { order: 11 }
      }
    }

    const text = JSON.stringify(createBackup(roster, jig))
    const result = parseBackup(text)

    // 用户改的 order 生效
    expect(result.jig?.engineeringConfig.PNP.order).toBe(11)
    // 默认表里的其它工序还在（并集，不是替换）
    expect(result.jig?.engineeringConfig['Jig入库']).toBeDefined()
  })

  it('旧版本备份（v5）报错', () => {
    const text = JSON.stringify({
      app: 'shift-schedule-local',
      version: 5,
      roster: { members: roster.members, overrides: [] }
    })
    expect(() => parseBackup(text)).toThrow('只认 v6')
  })
})
