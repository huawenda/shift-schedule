/**
 * 待办：记在某个日期上的个人事项清单。
 *
 * 待办只给**本人**用 —— 日历本来就锁本人，同事的待办无处查看，
 * 按成员分只会让数据结构变复杂却没有对应的展示位置。
 * 所以待办挂在 `Roster` 顶层，不带 memberId。
 *
 * 语义：
 * - 一条待办属于一个日期（`date`），可以有多条
 * - `done` 表示已完成；已完成的不删除，只划线置灰（保留历史）
 * - 待办与班次记录**互不影响**：记一条待办不会动班次，也不会清掉加班/法定
 */

/**
 * 便笺底色：1–6 号浅色。
 * 颜色只是视觉装饰（便于在列表里区分条目），不承载任何语义。
 */
export type TodoTone = 1 | 2 | 3 | 4 | 5 | 6

export const TODO_TONES: readonly TodoTone[] = [1, 2, 3, 4, 5, 6]

export function isTodoTone(value: unknown): value is TodoTone {
  return typeof value === 'number' && (TODO_TONES as readonly number[]).includes(value)
}

/**
 * 旧数据没有 tone 时按 id 稳定散列取色。
 * 不能用随机：否则每次加载 / 导入同一份备份，颜色都会变。
 */
export function todoToneFromId(id: string): TodoTone {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return TODO_TONES[hash % TODO_TONES.length]
}

/** 新增待办时随机取色；避开上一条的颜色，避免相邻两条撞色 */
export function pickTodoTone(previous?: TodoTone): TodoTone {
  const candidates = previous ? TODO_TONES.filter(tone => tone !== previous) : TODO_TONES
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** 一条待办 */
export interface Todo {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 事项正文，trim 后不能为空 */
  text: string
  /** 便笺底色，新增时随机分配，之后固定不变 */
  tone: TodoTone
  /** 是否已完成 */
  done: boolean
  /** 记录时的毫秒时间戳（同一排序时用 id 兜底） */
  createdAt: number
}

/** 一条待办的内容上限（弹层输入框与卡片共用） */
export const MAX_TODO_TEXT = 60

/** 待办 id 前缀，便于从存储里辨认 */
const TODO_ID_PREFIX = 't-'

export function createTodoId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${TODO_ID_PREFIX}${Date.now().toString(36)}-${random}`
}

/** '2026-11-25' 这样的日期串 */
function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(year, month - 1, day)
  // 反查一遍，挡住 2026-02-30 这种「格式对但日期不存在」的
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

/**
 * 归一化一条待办。
 *
 * 非法就整条丢掉 —— 待办是纯附加信息，一条坏数据不值得保留，
 * 但也不能让它把别的待办带下水（所以不抛异常，只返回 null）。
 */
export function normalizeTodo(value: unknown): Todo | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const date = typeof record.date === 'string' ? record.date.trim() : ''
  const text = typeof record.text === 'string' ? record.text.trim() : ''

  if (!id || !isDateKey(date) || !text) return null

  return {
    id,
    date,
    text: text.slice(0, MAX_TODO_TEXT),
    // 旧备份没有 tone：按 id 稳定分配，保证同一份数据每次颜色一致
    tone: isTodoTone(record.tone) ? record.tone : todoToneFromId(id),
    done: record.done === true,
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : 0
  }
}

/** 归一化待办数组：丢掉非法项、按日期与创建顺序排序、按 id 去重 */
export function normalizeTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<string, Todo>()
  value.forEach(item => {
    const todo = normalizeTodo(item)
    if (!todo) return
    // 同 id 只留第一条（先到的赢），避免备份被反复导入后越滚越多
    if (!byId.has(todo.id)) byId.set(todo.id, todo)
  })
  return sortTodos([...byId.values()])
}

/** 按日期升序、同日按创建时间升序 */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date)
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
    return left.id.localeCompare(right.id)
  })
}

/** 某一天的待办 */
export function todosOfDate(todos: Todo[], date: string): Todo[] {
  return todos.filter(todo => todo.date === date)
}

/** 待办按日期分组（每组内按创建顺序），日期升序 */
export interface TodoGroup {
  date: string
  todos: Todo[]
}

export function groupTodosByDate(todos: Todo[]): TodoGroup[] {
  const groups = new Map<string, Todo[]>()
  sortTodos(todos).forEach(todo => {
    const bucket = groups.get(todo.date)
    if (bucket) bucket.push(todo)
    else groups.set(todo.date, [todo])
  })
  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, items]) => ({ date, todos: items }))
}

/** 待办汇总：总数与未完成数 */
export interface TodoSummary {
  total: number
  done: number
  pending: number
}

export function summarizeTodos(todos: Todo[]): TodoSummary {
  const total = todos.length
  const done = todos.filter(todo => todo.done).length
  return { total, done, pending: total - done }
}
