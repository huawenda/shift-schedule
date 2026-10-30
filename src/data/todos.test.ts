import { describe, expect, it } from 'vitest'
import {
  TODO_TONES,
  groupTodosByDate,
  normalizeTodo,
  normalizeTodos,
  summarizeTodos,
  todoToneFromId,
  todosOfDate,
  type Todo,
  type TodoTone
} from './todos'
import { addTodo, removeTodo, toggleTodo, type Roster } from './roster'

const base: Roster = {
  members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
  overrides: [],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: 't-1',
    date: '2026-10-22',
    text: '交班记录表',
    tone: 1,
    done: false,
    createdAt: 1000,
    ...over
  }
}

describe('待办归一化', () => {
  it('合法的待办原样保留', () => {
    expect(normalizeTodo(todo())).toEqual(todo())
  })

  it('id / 日期 / 正文缺一不可', () => {
    expect(normalizeTodo({ ...todo(), id: '' })).toBeNull()
    expect(normalizeTodo({ ...todo(), date: '' })).toBeNull()
    expect(normalizeTodo({ ...todo(), text: '   ' })).toBeNull()
    expect(normalizeTodo(null)).toBeNull()
    expect(normalizeTodo('字符串')).toBeNull()
  })

  it('日期必须是真实存在的日历日', () => {
    expect(normalizeTodo({ ...todo(), date: '2026-10-22' })).not.toBeNull()
    expect(normalizeTodo({ ...todo(), date: '2026-02-30' })).toBeNull()
    expect(normalizeTodo({ ...todo(), date: '2026-13-01' })).toBeNull()
    expect(normalizeTodo({ ...todo(), date: '2026/10/22' })).toBeNull()
  })

  it('正文会被 trim 并截断到上限', () => {
    const result = normalizeTodo({ ...todo(), text: `  ${'长'.repeat(80)}  ` })
    expect(result?.text.length).toBe(60)
    expect(result?.text.startsWith('长')).toBe(true)
  })

  it('done 只认 true，其它值都当未完成', () => {
    expect(normalizeTodo({ ...todo(), done: true })?.done).toBe(true)
    expect(normalizeTodo({ ...todo(), done: 'yes' as unknown as boolean })?.done).toBe(false)
  })

  it('缺 tone 或 tone 非法时按 id 稳定分配颜色', () => {
    const missing = normalizeTodo({ ...todo(), tone: undefined } as unknown)
    expect(missing?.tone).toBe(todoToneFromId('t-1'))

    const invalid = normalizeTodo({ ...todo(), tone: 99 as unknown as TodoTone })
    expect(invalid?.tone).toBe(todoToneFromId('t-1'))

    // 同一份数据两次归一化必须同色，不能每次加载都变
    expect(normalizeTodo({ ...todo(), tone: undefined } as unknown)?.tone).toBe(missing?.tone)
  })

  it('数组归一化：丢掉脏数据、按 id 去重、按日期排序', () => {
    const list = normalizeTodos([
      todo({ id: 't-2', date: '2026-10-25', createdAt: 2000 }),
      todo({ id: 't-1', date: '2026-10-22', createdAt: 1000 }),
      todo({ id: 't-1', date: '2026-10-22', text: '重复的同 id', createdAt: 1500 }),
      { id: '', date: '2026-10-22', text: '没 id' }
    ])
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('t-1')
    expect(list[0].text).toBe('交班记录表')
    expect(list[1].id).toBe('t-2')
  })

  it('非数组输入得到空列表', () => {
    expect(normalizeTodos(undefined)).toEqual([])
    expect(normalizeTodos({})).toEqual([])
  })
})

describe('待办分组与统计', () => {
  const list = [
    todo({ id: 'a', date: '2026-10-22', createdAt: 1 }),
    todo({ id: 'b', date: '2026-10-22', done: true, createdAt: 2 }),
    todo({ id: 'c', date: '2026-10-25', createdAt: 3 })
  ]

  it('按日期分组，组内按创建顺序', () => {
    const groups = groupTodosByDate(list)
    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('2026-10-22')
    expect(groups[0].todos.map(item => item.id)).toEqual(['a', 'b'])
    expect(groups[1].date).toBe('2026-10-25')
  })

  it('取某一天的待办', () => {
    expect(todosOfDate(list, '2026-10-22')).toHaveLength(2)
    expect(todosOfDate(list, '2026-10-26')).toHaveLength(0)
  })

  it('统计总数与未完成数', () => {
    expect(summarizeTodos(list)).toEqual({ total: 3, done: 1, pending: 2 })
    expect(summarizeTodos([])).toEqual({ total: 0, done: 0, pending: 0 })
  })
})

describe('待办的增删改', () => {
  it('新增一条待办', () => {
    const next = addTodo(base, '2026-10-22', '  交班记录表  ')
    expect(next.todos).toHaveLength(1)
    expect(next.todos[0].text).toBe('交班记录表')
    expect(next.todos[0].done).toBe(false)
    expect(next.todos[0].date).toBe('2026-10-22')
    expect(TODO_TONES).toContain(next.todos[0].tone)
  })

  it('新增待办取色会避开上一条的颜色', () => {
    const withOne = { ...base, todos: [todo({ id: 't-old', tone: 3 })] }
    const next = addTodo(withOne, '2026-10-23', '新待办')
    const added = next.todos.find(item => item.id !== 't-old')
    expect(added).toBeTruthy()
    expect(TODO_TONES).toContain(added!.tone)
    expect(added!.tone).not.toBe(3)
  })

  it('正文为空则什么都不做', () => {
    const next = addTodo(base, '2026-10-22', '   ')
    expect(next.todos).toHaveLength(0)
    expect(next).toBe(base)
  })

  it('勾选与取消勾选', () => {
    const added = addTodo(base, '2026-10-22', '交班记录表')
    const toggled = toggleTodo(added, added.todos[0].id)
    expect(toggled.todos[0].done).toBe(true)
    const back = toggleTodo(toggled, toggled.todos[0].id)
    expect(back.todos[0].done).toBe(false)
  })

  it('勾选不存在的待办时原样返回', () => {
    expect(toggleTodo(base, 'ghost')).toBe(base)
    expect(removeTodo(base, 'ghost')).toBe(base)
  })

  it('删除一条待办', () => {
    const added = addTodo(base, '2026-10-22', '交班记录表')
    const removed = removeTodo(added, added.todos[0].id)
    expect(removed.todos).toHaveLength(0)
  })

  it('待办不影响考勤记录，也不被换人清掉', () => {
    const withRecords: Roster = {
      ...base,
      overrides: [{ memberId: 'm1', date: '2026-10-22', shift: '白班' }],
      profile: { memberId: 'm1', salary: { baseSalary: '8000', performanceAllowance: '', positionAllowance: '', socialFund: '' } }
    }
    const added = addTodo(withRecords, '2026-10-22', '交班记录表')
    // 记一条待办不动考勤
    expect(added.overrides).toEqual(withRecords.overrides)
    // 换人（改姓名）清考勤与薪资，但待办留着
    const swapped = {
      ...added,
      members: [{ ...added.members[0], name: '李静' }],
      overrides: [],
      profile: { memberId: 'm1', salary: { baseSalary: '', performanceAllowance: '', positionAllowance: '', socialFund: '' } }
    }
    expect(swapped.todos).toHaveLength(1)
  })
})
