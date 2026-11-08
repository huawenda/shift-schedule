import { useState } from 'react'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import type { DayOverride, Member } from '../data/roster'
import { canRecordOvertime, formatOvertimeHours } from '../data/overtime'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ShiftEditorProps {
  member: Member
  date: string
  currentShift: ShiftType | null
  templateShift: ShiftType | null
  /** 这一天已有的整天记录 —— 只用来提示「改班会不会连带清掉加班」 */
  record?: DayOverride
  onApply: (shift: ShiftType | null) => void
  onClose: () => void
}

/**
 * 全员矩阵用的改班弹层：只能改班次，不能记加班（加班只在个人日历里录）。
 *
 * 外壳换成 shadcn `Dialog`（Radix）：焦点陷阱、Esc、遮罩点击、Portal、关闭后归还焦点
 * 全部由它提供，原来那套 `useDialogFocus` + 手写 keydown 监听因此删掉。
 * 内容区仍是自研：6 个班次色块（`.option` + 班次语义色）是业务视觉，通用控件拼不出来。
 *
 * 只有真的和模板不同才会落记录；改回模板值等于删除（由数据层保证）。
 * 例外：这天原本有加班/法定时，改成休息或事假会连带清掉它们，这里提前提示。
 */
export function ShiftEditor({
  member,
  date,
  currentShift,
  templateShift,
  record,
  onApply,
  onClose
}: ShiftEditorProps) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<ShiftType | null>(currentShift)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const edited = Boolean(record)
  const dirty = selected !== currentShift

  // Android 返回键：Radix 不管这个，仍用项目自己的历史栈拦截
  useDismissOnBack(true, requestClose)

  /** 改了还没保存就关闭：先拦一下，别把改动静默丢掉 */
  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    setOpen(false)
    onClose()
  }

  const extraText = [
    record?.overtimeHours ? `+${formatOvertimeHours(record.overtimeHours)} 加班` : '',
    record?.isLegal ? '法定' : ''
  ].filter(Boolean).join('、')

  const willClearExtra = Boolean(
    extraText &&
      selected &&
      !canRecordOvertime(selected) &&
      (record?.overtimeHours || record?.isLegal)
  )

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) requestClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[420px]">
        <DialogHeader className="dialog-head p-4">
          <div>
            <DialogTitle className="dialog-title">{member.name}</DialogTitle>
            <DialogDescription className="dialog-sub">
              {formatMonthDay(date)} · 周{weekdayLabel(date)} · 模板{' '}
              {templateShift ? SHIFT_META[templateShift].label : '—'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div aria-label="选择班次" className="dialog-options" role="group">
          {SHIFT_TYPES.map(shift => {
            // 模板是休息的日子不存在「请假」这回事，不允许改成事假
            const leaveBlocked = shift === '事假' && templateShift === '休息'
            return (
              <button
                aria-label={leaveBlocked ? `${SHIFT_META[shift].label}（模板是休息，不可选）` : undefined}
                aria-pressed={selected === shift}
                className={`option ${shiftToneClass(shift)}${selected === shift ? ' is-on' : ''}`}
                disabled={leaveBlocked}
                key={shift}
                type="button"
                onClick={() => setSelected(shift)}
              >
                {SHIFT_META[shift].label}
              </button>
            )
          })}
        </div>

        {willClearExtra ? (
          <p className="dialog-warn" role="status">
            这天有 {extraText} 记录，改为「{selected ? SHIFT_META[selected].label : ''}」会一并清除。
            加班请在「个人日历」里录入。
          </p>
        ) : null}

        <DialogFooter className="mx-0 mb-0">
          {confirmDiscard ? (
            <>
              <span className="dialog-discard mr-auto">有未保存的修改</span>
              <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
                继续编辑
              </Button>
              <Button variant="destructive" onClick={onClose}>
                放弃修改
              </Button>
            </>
          ) : (
            <>
              <Button
                className="mr-auto"
                disabled={!edited}
                variant="ghost"
                onClick={() => onApply(null)}
              >
                恢复默认
              </Button>
              <Button variant="outline" onClick={requestClose}>
                取消
              </Button>
              <Button disabled={!selected} onClick={() => selected && onApply(selected)}>
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
