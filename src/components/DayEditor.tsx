import { useEffect, useMemo, useState } from 'react'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import type { DayOverride, DayRecordInput, Member } from '../data/roster'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  MAX_OVERTIME_HOURS,
  OVERTIME_STEP,
  canMarkLegal,
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
  const [open, setOpen] = useState(true)
  // 系统返回键：先关弹层（等同点遮罩，有未保存改动时仍会拦一下）
  useDismissOnBack(true, requestClose)
  const [tab, setTab] = useState<DayEditorTab>('shift')
  /** 改过但没保存时关闭弹层：先就地确认，别静默丢改动 */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
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

  const overtimeAllowed = Boolean(shift && canRecordOvertime(shift))
  /** 法定与加班不是同一条规则：休息日也能是法定日 */
  const legalAllowed = Boolean(shift && canMarkLegal(shift))
  const overtimeHours = overtimeAllowed ? normalizeOvertimeHours(overtimeText) : 0
  /** 白特/夜特 = 休息日来上白班/夜班，必然产生加班：不记加班就不允许保存 */
  const overtimeRequired = shift === '白特' || shift === '夜特'
  const missingOvertime = overtimeRequired && overtimeHours <= 0
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

  /** 换到不支持加班 / 法定的班次时，把对应的值原地清掉（避免切回去又冒出来） */
  function pickShift(next: ShiftType) {
    setShift(next)
    // 两条规则分开清：休息能标法定，但记不了加班
    if (!canRecordOvertime(next)) setOvertimeText('')
    if (!canMarkLegal(next)) setIsLegal(false)
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

  /** 关闭前先拦住未保存的改动；待办页的改动是即时生效的，不受影响 */
  function requestClose() {
    if (tab === 'shift' && dirty) {
      setConfirmDiscard(true)
      return
    }
    setOpen(false)
    onClose()
  }

  /** 添加待办：加完清空输入框 */
  function submitTodo() {
    const body = todoText.trim()
    if (!body) return
    onAddTodo(body)
    setTodoText('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) requestClose()
      }}
    >
      <DialogContent
        aria-label="修改当天记录"
        className="dialog-day max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[480px]"
      >
        <DialogHeader className="dialog-head p-4">
          <div>
            <DialogTitle className="dialog-title">{member.name}</DialogTitle>
            <DialogDescription className="dialog-sub">
              {formatMonthDay(date)} · 周{weekdayLabel(date)} · 默认{' '}
              {templateShift ? SHIFT_META[templateShift].label : '—'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* 两个标签页：班次 / 待办 */}
        <div className="dialog-tabs" role="group" aria-label="当天记录">
          <button
            aria-pressed={tab === 'shift'}
            className={`dialog-tab${tab === 'shift' ? ' is-on' : ''}`}
            type="button"
            onClick={() => {
              setConfirmDiscard(false)
              setTab('shift')
            }}
          >
            班次
          </button>
          <button
            aria-pressed={tab === 'todo'}
            className={`dialog-tab${tab === 'todo' ? ' is-on' : ''}`}
            type="button"
            onClick={() => {
              setConfirmDiscard(false)
              setTab('todo')
            }}
          >
            待办
            {todos.length > 0 ? <span className="dialog-tab-count">{todos.length}</span> : null}
          </button>
        </div>

        {tab === 'todo' ? (
          <div className="dialog-page">
            <div className="todo-add">
              <Input
                aria-label="新增待办"
                autoComplete="off"
                className="flex-1"
                maxLength={MAX_TODO_TEXT}
                name="todo-text"
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
                  <li className={`todo-list-item todo-tone-${todo.tone}${todo.done ? ' is-done' : ''}`} key={todo.id}>
                    {/* 与待办卡（TodoCard）用同一个原生 checkbox：
                        `.todo-check` 的 accent-color / is-done 勾线是给 input 写的，
                        这里若换成一个空 button，全局 reset 掉边框和底色之后
                        未完成态就完全看不见了 —— 曾出现过这个回归。 */}
                    <input
                      aria-label={`${todo.done ? '取消完成' : '标记完成'}：${todo.text}`}
                      checked={todo.done}
                      className="todo-check"
                      type="checkbox"
                      onChange={() => onToggleTodo(todo.id)}
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
              {SHIFT_TYPES.map(item => {
                // 默认班次是休息的日子不存在「请假」这回事，不允许改成事假
                const leaveBlocked = item === '事假' && templateShift === '休息'
                return (
                  <button
                    aria-label={leaveBlocked ? `${SHIFT_META[item].label}（默认班次是休息，不可选）` : undefined}
                    aria-pressed={shift === item}
                    className={`option ${shiftToneClass(item)}${shift === item ? ' is-on' : ''}`}
                    disabled={leaveBlocked}
                    key={item}
                    type="button"
                    onClick={() => pickShift(item)}
                  >
                    {SHIFT_META[item].label}
                  </button>
                )
              })}
            </div>

            {leaveAllowed ? (
              <>
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

                {/* 事假不记加班与法定：用一张说明卡替代那两格，
                    既解释了原因，也让班次页所有选中态保持同高 */}
                <div className="dialog-section">
                  <div className="section-head">
                    <span className="section-title">加班与法定</span>
                  </div>
                  <p className="section-note">事假不记加班，也不参与法定节假日加班费计算。</p>
                </div>
              </>
            ) : (
              <>
                <div className={`dialog-section${overtimeAllowed ? '' : ' is-disabled'}`}>
                  <div className="section-head">
                    <span className="section-title">加班</span>
                    {/* 可录加班时不写「0.5h 步长，最多 24h」：预设胶囊 + 输入框自己说明问题，
                        这行小字只是在标题右边添一段噪音；只有灰掉或缺失时才有必要解释 */}
                    {!overtimeAllowed ? (
                      <span className="section-note">休息与事假不记加班</span>
                    ) : missingOvertime ? (
                      <span className="section-note">特勤必须记录加班</span>
                    ) : null}
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
                      <Input
                        aria-label="加班小时数"
                        autoComplete="off"
                        className="h-8 w-[84px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        disabled={!overtimeAllowed}
                        inputMode="decimal"
                        name="overtime-hours"
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
              </>
            )}
          </>
        )}

        {/*
          底栏跟着页签走：
          - 班次页：恢复默认 / 取消 / 保存（改动要显式保存）
          - 待办页：只有一个「完成」（待办改动立即生效，没有待保存的东西）
        */}
        <DialogFooter className="mx-0 mb-0">
          {confirmDiscard ? (
            <>
              <span className="dialog-discard mr-auto">有未保存的修改</span>
              <Button variant="outline" onClick={() => setConfirmDiscard(false)}>继续编辑</Button>
              <Button variant="destructive" onClick={onClose}>放弃修改</Button>
            </>
          ) : tab === 'shift' ? (
            <>
              <Button className="mr-auto" disabled={!hasRecord} variant="ghost" onClick={onRestore}>
                恢复默认
              </Button>
              <Button variant="outline" onClick={requestClose}>取消</Button>
              <Button disabled={!shift || !dirty || missingOvertime} onClick={commit}>
                保存
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>完成</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
