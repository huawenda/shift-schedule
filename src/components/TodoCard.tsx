import { groupTodosByDate, summarizeTodos, type Todo } from '../data/todos'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'

interface TodoCardProps {
  todos: Todo[]
  /** 勾选 / 取消勾选 —— 改动立即生效 */
  onToggle: (todoId: string) => void
}

/**
 * 待办卡片：列出**本月全部**待办，按日期分组。
 *
 * 只做摘要与勾选 —— 新增/删除待办在日历弹层的「待办」页里做，
 * 卡片上直接勾选是为了省掉「为了划掉一件事而开一次弹层」这种来回。
 *
 * 高度与左侧日历等高（由外层 flex 布局决定），内容超出时内部滚动。
 */
export function TodoCard({ todos, onToggle }: TodoCardProps) {
  const groups = groupTodosByDate(todos)
  const summary = summarizeTodos(todos)

  return (
    <section className="todo-card card-surface" aria-label="待办">
      <div className="todo-card-fill">
        <header className="todo-card-head">
          <h2 className="todo-card-title">待办</h2>
          <span className="todo-card-stat">
            {summary.total > 0 ? `${summary.total} 项 · ${summary.pending} 项未完成` : '本月暂无'}
          </span>
        </header>

        {groups.length === 0 ? (
          <div className="todo-empty">
            这个月还没有待办。
          </div>
        ) : (
          <div className="todo-scroll">
            {groups.map(group => (
              <div className="todo-group" key={group.date}>
                <p className="todo-group-date">
                  <span className="todo-group-day">{formatMonthDay(group.date)}</span>
                  <span className="todo-group-week">周{weekdayLabel(group.date)}</span>
                </p>
                <ul className="todo-items">
                  {group.todos.map(todo => (
                    <li className={`todo-item todo-tone-${todo.tone}${todo.done ? ' is-done' : ''}`} key={todo.id}>
                      {/* 与沙盒一致：label 包住原生 checkbox + 文字，整行都能点 */}
                      <label className="todo-row">
                        <input
                          checked={todo.done}
                          className="todo-check"
                          type="checkbox"
                          onChange={() => onToggle(todo.id)}
                        />
                        <span className="todo-text">{todo.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
