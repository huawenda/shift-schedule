import { useEffect, useMemo, useState } from 'react'
import type { DayOverride, DayRecordInput, Member } from '../data/roster'
import { useDialogFocus } from '../hooks/useDialogFocus'
import {
  MAX_OVERTIME_HOURS,
  OVERTIME_STEP,
  canRecordOvertime,
  formatOvertimeHours,
  getOvertimePresets,
  normalizeOvertimeHours
} from '../data/overtime'
import {
  DEFAULT_LEAVE_DURATION,
  LEAVE_DURATIONS,
  LEAVE_HOURS,
  type LeaveDuration
} from '../data/leave'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { MAX_TODO_TEXT, type Todo } from '../data/todos'

interface DayEditorProps {
  member: Member
  date: string
  /** 这一天的有效班次（改过就是改后的，否则是模板） */
  currentShift: ShiftType | null
  templateShift: ShiftType | null
  /** 已存在的整天记录，没有则为 undefined */
  record?: DayOverride
  /** 当天的待办 */
  todos: Todo[]
  onApply: (input: DayRecordInput) => void
  onRestore: () => void
  /** 待办：新增 / 勾选 / 删除 —— 改动立即生效，不走班次那套保存流程 */
  onAddTodo: (text: string) => void
  onToggleTodo: (todoId: string) => void
  onRemoveTodo: (todoId: string) => void
  onClose: () => void
}

const LEGAL_OPTIONS: Array<{ value: boolean; label: string }> = [
  { value: false, label: '否' },
  { value: true, label: '是' }
]

/** 弹层的两个标签页 */
type DayEditorTab = 'shift' | 'todo'

/**
 * 日历专用的「改班 + 加班 + 法定 + 事假时长 / 待办」弹层。
 *
 * 与矩阵弹层（`ShiftEditor`）的区别：这里能记加班、法定与事假时长，还能记待办。
 * 加班与法定只对有工时的班次开放；事假时长只在选到「事假」时出现 ——
 * 薪资里的扣款按「时薪 × 请假小时」算，4h 和 8h 差一倍，所以必须记。
 *
 * 分成两个标签页：
 * - **班次**：班次 + 加班 + 法定 + 事假时长，改动走「保存 / 恢复默认」
 * - **待办**：当天的待办清单，改动**立即生效**（不走保存）
 *   —— 待办与考勤记录互不依赖，套用班次那套 dirty/save/取消会很别扭
 */
export function DayEditor({
  member,
  date,
  currentShift,
  templateShift,
  record,
  todos,
  onApply,
  onRestore,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
  onClose
}: DayEditorProps) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const [tab, setTab] = useState<DayEditorTab>('shift')
  const [todoText, setTodoText] = useState('')
  const [shift, setShift] = useState<ShiftType | null>(currentShift)
  const [overtimeText, setOvertimeText] = useState(() => {
    const hours = record?.overtimeHours
    return hours && hours > 0 ? String(hours) : ''
  })
  const [isLegal, setIsLegal] = useState(record?.isLegal === true)
  const [leaveDuration, setLeaveDuration] = useState<LeaveDuration>(
    record?.leaveDuration ?? DEFAULT_LEAVE_DURATION
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const overtimeAllowed = Boolean(shift && canRecordOvertime(shift))
  const legalAllowed = overtimeAllowed
  const overtimeHours = overtimeAllowed ? normalizeOvertimeHours(overtimeText) : 0
  const presets = useMemo(
    () => (shift ? getOvertimePresets(shift, legalAllowed && isLegal) : []),
    [shift, isLegal, legalAllowed]
  )

  const leaveAllowed = shift === '事假'
  const hasRecord = Boolean(record)
  const dirty =
    shift !== currentShift ||
    overtimeHours !== (record?.overtimeHours ?? 0) ||
    (legalAllowed && isLegal) !== (record?.isLegal === true) ||
    (leaveAllowed ? leaveDuration : DEFAULT_LEAVE_DURATION) !==
      (record?.leaveDuration ?? DEFAULT_LEAVE_DURATION)

  /** 换到不支持加班的班次时，把两段的值原地清掉（避免切回去又冒出来） */
  function pickShift(next: ShiftType) {
    setShift(next)
    if (!canRecordOvertime(next)) {
      setOvertimeText('')
      setIsLegal(false)
    }
  }

  function pickPreset(hours: number) {
    setOvertimeText(overtimeHours === hours ? '' : String(hours))
  }

  function commit() {
    if (!shift) return
    onApply({
      shift,
      overtimeHours: overtimeAllowed && overtimeHours > 0 ? overtimeHours : undefined,
      isLegal: legalAllowed && isLegal ? true : undefined,
      leaveDuration: leaveAllowed ? leaveDuration : undefined
    })
  }

  /** 添加待办：加完清空输入框 */
  function submitTodo() {
    const body = todoText.trim()
    if (!body) return
    onAddTodo(body)
    setTodoText('')
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="修改当天记录"
        aria-modal="true"
        className="dialog dialog-day"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 className="dialog-title">{member.name}</h2>
            <p className="dialog-sub">
              {formatMonthDay(date)} · 周{weekdayLabel(date)} · 默认{' '}
              {templateShift ? SHIFT_META[templateShift].label : '—'}
            </p>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>关闭</button>
        </header>

        {/* 两个标签页：班次 / 待办 */}
        <div className="dialog-tabs" role="tablist" aria-label="当天记录">
          <button
            aria-selected={tab === 'shift'}
            className={`dialog-tab${tab === 'shift' ? ' is-on' : ''}`}
            role="tab"
            type="button"
            onClick={() => setTab('shift')}
          >
            班次
          </button>
          <button
            aria-selected={tab === 'todo'}
            className={`dialog-tab${tab === 'todo' ? ' is-on' : ''}`}
            role="tab"
            type="button"
            onClick={() => setTab('todo')}
          >
            待办
            {todos.length > 0 ? <span className="dialog-tab-count">{todos.length}</span> : null}
          </button>
        </div>

        {tab === 'todo' ? (
          <div className="dialog-page" role="tabpanel">
            <div className="todo-add">
              <input
                aria-label="新增待办"
                className="input"
                maxLength={MAX_TODO_TEXT}
                placeholder="写点什么…"
                type="text"
                value={todoText}
                onChange={event => setTodoText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitTodo()
                  }
                }}
              />
              <button className="btn btn-primary" disabled={!todoText.trim()} type="button" onClick={submitTodo}>
                添加
              </button>
            </div>

            {todos.length === 0 ? (
              <p className="stat-empty">这一天还没有待办。</p>
            ) : (
              <ul className="todo-list">
                {todos.map(todo => (
                  <li className={`todo-list-item${todo.done ? ' is-done' : ''}`} key={todo.id}>
                    <button
                      aria-label={`${todo.done ? '取消完成' : '标记完成'}：${todo.text}`}
                      aria-pressed={todo.done}
                      className="todo-check"
                      type="button"
                      onClick={() => onToggleTodo(todo.id)}
                    />
                    <span className="todo-text">{todo.text}</span>
                    <button
                      aria-label={`删除待办：${todo.text}`}
                      className="todo-remove"
                      type="button"
                      onClick={() => onRemoveTodo(todo.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

          </div>
        ) : (
          <>
            <div className="dialog-options" role="group" aria-label="选择班次">
              {SHIFT_TYPES.map(item => (
                <button
                  aria-pressed={shift === item}
                  className={`option ${shiftToneClass(item)}${shift === item ? ' is-on' : ''}`}
                  key={item}
                  type="button"
                  onClick={() => pickShift(item)}
                >
                  {SHIFT_META[item].label}
                </button>
              ))}
            </div>

            <div className={`dialog-section${overtimeAllowed ? '' : ' is-disabled'}`}>
              <div className="section-head">
                <span className="section-title">加班</span>
                {/* 可录加班时不写「0.5h 步长，最多 24h」：预设胶囊 + 输入框自己说明问题，
                    这行小字只是在标题右边添一段噪音；只有灰掉时才需要解释为什么不能填 */}
                {overtimeAllowed ? null : <span className="section-note">休息与事假不记加班</span>}
              </div>

              <div className="ot-row">
                <div className="ot-presets" role="group" aria-label="加班预设">
                  {presets.map(hours => (
                    <button
                      aria-pressed={overtimeHours === hours}
                      className={`chip-mini${overtimeHours === hours ? ' is-on' : ''}`}
                      disabled={!overtimeAllowed}
                      key={hours}
                      type="button"
                      onClick={() => pickPreset(hours)}
                    >
                      {formatOvertimeHours(hours)}
                    </button>
                  ))}
                  {presets.length === 0 ? <span className="ot-empty">—</span> : null}
                </div>

                <label className="ot-input">
                  <input
                    aria-label="加班小时数"
                    className="input input-compact"
                    disabled={!overtimeAllowed}
                    inputMode="decimal"
                    min={0}
                    max={MAX_OVERTIME_HOURS}
                    step={OVERTIME_STEP}
                    type="number"
                    value={overtimeText}
                    onChange={event => setOvertimeText(event.target.value)}
                  />
                  <span className="ot-unit">小时</span>
                </label>
              </div>
            </div>

            <div className={`dialog-section${legalAllowed ? '' : ' is-disabled'}`}>
              <div className="section-head">
                <span className="section-title">法定节假日</span>
              </div>
              <div className="segmented segmented-sm" role="group" aria-label="是否法定">
                {LEGAL_OPTIONS.map(option => (
                  <button
                    aria-pressed={isLegal === option.value}
                    className={`segmented-item${(legalAllowed && isLegal) === option.value ? ' is-on' : ''}`}
                    disabled={!legalAllowed}
                    key={option.label}
                    type="button"
                    onClick={() => setIsLegal(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {leaveAllowed ? (
              <div className="dialog-section">
                <div className="section-head">
                  <span className="section-title">事假时长</span>
                  <span className="section-note">
                    按 {LEAVE_HOURS[leaveDuration]} 小时从工资里扣
                  </span>
                </div>
                <div className="segmented segmented-sm" role="group" aria-label="事假时长">
                  {LEAVE_DURATIONS.map(duration => (
                    <button
                      aria-pressed={leaveDuration === duration}
                      className={`segmented-item${leaveDuration === duration ? ' is-on' : ''}`}
                      key={duration}
                      type="button"
                      onClick={() => setLeaveDuration(duration)}
                    >
                      {duration}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/*
          底栏跟着页签走：
          - 班次页：恢复默认 / 取消 / 保存（改动要显式保存）
          - 待办页：只有一个「完成」（待办改动立即生效，没有待保存的东西）
        */}
        <footer className="dialog-foot">
          {tab === 'shift' ? (
            <>
              <button className="btn btn-quiet" disabled={!hasRecord} type="button" onClick={onRestore}>
                恢复默认
              </button>
              <div className="dialog-actions">
                <button className="btn" type="button" onClick={onClose}>取消</button>
                <button className="btn btn-primary" disabled={!shift || !dirty} type="button" onClick={commit}>
                  保存
                </button>
              </div>
            </>
          ) : (
            <div className="dialog-actions dialog-actions-end">
              <button className="btn" type="button" onClick={onClose}>完成</button>
            </div>
          )}
        </footer>
      </section>
    </div>
  )
}
