import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import {
  blankPair,
  movePair,
  orderedPairs,
  pairsToMapping,
  validateMappingPairs,
  type MappingPair
} from '../core/mapping'
import { createDefaultJigConfig, type JigConfig } from '../core/config'
import { JigScrollbar } from './JigScrollbar'

interface JigSizeMappingDialogProps {
  /** 当前的业务配置 */
  config: JigConfig
  /**
   * 保存。
   *
   * 同时回传排列顺序 —— 映射表是 `Record<string, string>`，存不下用户排的
   * 顺序（JS 对象会把纯数字键按数值升序排在前面），顺序必须单列一份。
   */
  onSave: (mapping: Record<string, string>, order: string[]) => void
  /** 关闭（丢弃未保存的改动） */
  onClose: () => void
}

/**
 * 型号尺寸匹配面板。
 *
 * **独立于设置页，不做成设置里的一个分组。** 理由有二：
 *   1. 设置页是固定宽的表单，映射表通常有十几行，塞进去会把整页挤到要滚动；
 *   2. 这张表是使用频率最高、也最容易出错的一块，值得一个单独的入口。
 *
 * 编辑的是草稿，点「保存」才回传；点「取消」原样丢弃。
 * **有校验错误时一律不提交** —— 避免写出一份半成品配置。
 */
export function JigSizeMappingDialog({
  config,
  onSave,
  onClose
}: JigSizeMappingDialogProps) {
  const [pairs, setPairs] = useState<MappingPair[]>(() =>
    orderedPairs(config.jigSizeMapping, config.jigSizeMappingOrder)
  )
  /** 打开时的初始值，用来判断「有未保存的改动」 */
  const initialPairs = useRef(pairs).current
  const dirty = useMemo(
    () => JSON.stringify(pairs) !== JSON.stringify(initialPairs),
    [pairs, initialPairs]
  )
  /** 关闭前先拦一下未保存的改动（与班次弹层同一套） */
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }

  const errors = useMemo(() => validateMappingPairs(pairs), [pairs])
  const errorCount = Object.keys(errors).length

  /**
   * 排序模式。
   *
   * 与人员配置（MemberRowsEditor）同一套：进入后把行压成 44px 紧凑行，
   * 只有行首把手能拖，固定步长 52（行高 44 + 间距 8）。
   * 编辑态里的输入框高度不一（有报错时还会长出一行），直接拿固定步长
   * 做 transform 会让行互相重叠、目标位置算错 —— 这正是之前「动效很乱」的原因。
   */
  const [sorting, setSorting] = useState(false)

  /**
   * 报错信息在行内，列表又是可滚动的 —— 用户在末尾新增一行、填了重复型号，
   * 红框确实出现了，但提示文字往往落在可视区之外，表现就是「保存按钮灰了
   * 但不知道为什么」。所以第一处出错时自动滚过去。
   */
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  /* ------------------------------------------------------------ 拖拽排序
   *
   * **只在排序模式里启用**，行复用人员配置的 `.sort-row` 样式（44px 高 +
   * 8px 间距），所以固定步长 52 与实际行距严格相等。
   *
   * 用 pointer events + setPointerCapture，不是 HTML5 drag —— 本项目在
   * main.tsx 里全局禁用了原生拖拽（防 URL 预览浮层），成员表也是这套，
   * 因此不需要为 JIG 开任何拖拽白名单。
   *
   * 被拖行跟手，夹在它和目标之间的行让出一条；拖到滚动区上下缘自动滚。
   */
  const SORT_STEP = 52
  const [sortDrag, setSortDrag] = useState<{
    from: number
    target: number
    offset: number
  } | null>(null)
  const sortRef = useRef<{
    from: number
    target: number
    startY: number
    startScroll: number
    y: number
  } | null>(null)
  const autoScrollTimer = useRef<number | null>(null)

  function stopAutoScroll() {
    if (autoScrollTimer.current !== null) {
      window.clearInterval(autoScrollTimer.current)
      autoScrollTimer.current = null
    }
  }

  useEffect(() => stopAutoScroll, [])

  function updateSort(clientY: number) {
    const state = sortRef.current
    if (!state) return
    const scroll = listRef.current?.scrollTop ?? 0
    const raw = clientY - state.startY + (scroll - state.startScroll)
    const min = -state.from * SORT_STEP
    const max = (pairs.length - 1 - state.from) * SORT_STEP
    const offset = Math.min(max, Math.max(min, raw))
    const target = Math.min(
      pairs.length - 1,
      Math.max(0, Math.round((state.from * SORT_STEP + offset) / SORT_STEP))
    )
    state.target = target
    state.y = clientY
    setSortDrag({ from: state.from, target, offset })
  }

  function sortAutoStep() {
    const state = sortRef.current
    if (!state) return
    const scroller = listRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const edge = 56
    if (state.y < rect.top + edge) scroller.scrollTop -= 10
    else if (state.y > rect.bottom - edge) scroller.scrollTop += 10
    updateSort(state.y)
  }

  function onSortPointerDown(
    index: number,
    event: React.PointerEvent<HTMLSpanElement>
  ) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    sortRef.current = {
      from: index,
      target: index,
      startY: event.clientY,
      startScroll: listRef.current?.scrollTop ?? 0,
      y: event.clientY
    }
    setSortDrag({ from: index, target: index, offset: 0 })
    stopAutoScroll()
    autoScrollTimer.current = window.setInterval(sortAutoStep, 40)
  }

  function onSortPointerMove(event: React.PointerEvent<HTMLSpanElement>) {
    if (!sortRef.current) return
    event.preventDefault()
    updateSort(event.clientY)
  }

  function onSortPointerUp(event: React.PointerEvent<HTMLSpanElement>) {
    const state = sortRef.current
    if (!state) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    sortRef.current = null
    setSortDrag(null)
    stopAutoScroll()
    move(state.from, state.target)
  }

  /** 指针被系统打断（来电、切窗口等）：放弃这次拖动，不落顺序 */
  function cancelSortDrag() {
    sortRef.current = null
    setSortDrag(null)
    stopAutoScroll()
  }

  /** 被拖行跟手，夹在它和目标之间的行让出一条行距 */
  function sortTransform(index: number): string {
    if (!sortDrag) return ''
    if (index === sortDrag.from) return `translateY(${sortDrag.offset}px)`
    if (
      sortDrag.from < sortDrag.target &&
      index > sortDrag.from &&
      index <= sortDrag.target
    ) {
      return `translateY(-${SORT_STEP}px)`
    }
    if (
      sortDrag.from > sortDrag.target &&
      index >= sortDrag.target &&
      index < sortDrag.from
    ) {
      return `translateY(${SORT_STEP}px)`
    }
    return ''
  }

  useEffect(() => {
    const firstIndex = Object.keys(errors).map(Number)[0]
    if (firstIndex === undefined) return
    rowRefs.current[firstIndex]?.scrollIntoView({ block: 'nearest' })
  }, [errors])

  /*
   * 列表可视高度对齐到**整行**。
   *
   * 滚动区高度如果不是行距的整数倍，底部会露出下一行输入框的上边框 ——
   * 看起来像多画了两条横线。这里按「表头 + 若干完整行」算高度，
   * 静止时底部永远落在行与行的分界上。
   */
  useEffect(() => {
    const body = listRef.current
    if (!body) return

    const align = () => {
      const map = body.parentElement
      const head = map?.querySelector<HTMLElement>('.jig-map-head')
      const headHeight = head
        ? head.offsetHeight + (parseFloat(getComputedStyle(head).marginBottom) || 0)
        : 0
      const rows = [...body.querySelectorAll<HTMLElement>('.jig-map-row, .sort-row')]
      if (rows.length === 0) {
        body.style.height = ''
        return
      }

      const sortGap = body.querySelector('.sort-row') ? 8 : 0
      // 与 .jig-map 的 max-height: min(60vh, 520px) 保持一致（含上下 padding 与表头）
      const cap = Math.min(window.innerHeight * 0.6, 520) - 24 - headHeight
      let used = 0
      for (const row of rows) {
        const next = used + row.offsetHeight + sortGap
        if (next > cap) break
        used = next
      }
      // 至少留一行，避免窗口极矮时滚动区高度为 0
      body.style.height = `${Math.max(rows[0].offsetHeight, used)}px`
    }

    const frame = requestAnimationFrame(align)
    window.addEventListener('resize', align)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', align)
    }
  }, [pairs, sorting])

  const patch = (index: number, next: Partial<MappingPair>) =>
    setPairs(prev =>
      prev.map((row, i) => (i === index ? { ...row, ...next } : row))
    )

  const add = () => setPairs(prev => [...prev, blankPair()])
  const remove = (index: number) =>
    setPairs(prev => prev.filter((_, i) => i !== index))
  const move = (from: number, to: number) =>
    setPairs(prev => movePair(prev, from, to))

  /**
   * 「恢复默认」恢复的是**内置默认映射**，不是当前配置里的那份。
   *
   * 一开始这里传的是 `config.jigSizeMapping`，结果是：用户改完规则保存，
   * 下次打开面板点「恢复默认」，拿回的正是他自己刚存的那份 —— 按钮看着有反应，
   * 但什么也没恢复。默认表是代码里的 `createDefaultJigConfig()`，不会被用户配置污染。
   */
  const restore = () => {
    const defaults = createDefaultJigConfig()
    setPairs(orderedPairs(defaults.jigSizeMapping, defaults.jigSizeMappingOrder))
  }

  const save = () => {
    if (errorCount > 0) return
    const mapping = pairsToMapping(pairs)
    // 顺序单独存一份：映射表本身存不下顺序
    const order = pairs.map(p => p.model.trim()).filter(Boolean)
    onSave(mapping, order)
  }

  return (
    <Dialog onOpenChange={open => { if (!open) requestClose() }} open>
      <DialogContent
        className="jig-map-dialog gap-0 p-0"
        onInteractOutside={event => {
          // 点遮罩 = 取消；有未保存改动时先确认
          event.preventDefault()
          requestClose()
        }}
        onOpenAutoFocus={event => {
          // 不在打开时自动聚焦第一个输入框（否则 184 会被选中、弹出即带焦点环）
          event.preventDefault()
        }}
        showCloseButton={false}
      >
        <DialogHeader className="dialog-head">
          <DialogTitle className="dialog-title">型号尺寸匹配</DialogTitle>
        </DialogHeader>

        <div className="jig-map">
          {/*
            表头放在滚动区**外面**：原生滚动条已隐藏（改用 JigScrollbar），
            两者宽度一致，列能严格对齐；同时表头不会盖住滚动的行，
            也不存在 sticky 背景透出内容的问题。排序模式是另一套紧凑行，隐藏。
          */}
          {sorting ? null : (
            <div className="jig-map-head">
              <span>型号</span>
              <span>对应尺寸</span>
              <span />
            </div>
          )}

          <div className="jig-map-body" ref={listRef}>
            {pairs.length === 0 ? (
              <p className="jig-map-empty">
                还没有任何映射规则，点下方「新增」开始添加。
              </p>
            ) : sorting ? (
              /* 排序模式：与人员配置同一套紧凑行，行高 44 + 间距 8 */
              <div className={sortDrag ? 'sort-list is-dragging' : 'sort-list'}>
                {pairs.map((pair, index) => (
                  <div
                    className={[
                      'sort-row',
                      sortDrag?.from === index ? 'is-dragging' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={index}
                    style={{ transform: sortTransform(index) }}
                  >
                    <span
                      className="sort-handle"
                      onPointerCancel={cancelSortDrag}
                      onPointerDown={event => onSortPointerDown(index, event)}
                      onPointerMove={onSortPointerMove}
                      onPointerUp={onSortPointerUp}
                    >
                      ⠿
                    </span>
                    <span className="sort-name">
                      {pair.model.trim() || '（未填型号）'}
                    </span>
                    <span className="sort-meta">{pair.size.trim() || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              pairs.map((pair, index) => {
                const error = errors[index]
                return (
                  <div
                    className="jig-map-row"
                    key={index}
                    ref={el => {
                      rowRefs.current[index] = el
                    }}
                  >
                    <Input
                      aria-label={`第 ${index + 1} 行型号`}
                      aria-invalid={Boolean(error)}
                      className="jig-map-input"
                      onChange={event => patch(index, { model: event.target.value })}
                      placeholder="型号"
                      value={pair.model}
                    />
                    <Input
                      aria-label={`第 ${index + 1} 行对应尺寸`}
                      className="jig-map-input"
                      onChange={event => patch(index, { size: event.target.value })}
                      placeholder="对应尺寸"
                      value={pair.size}
                    />
                    <div className="jig-map-act">
                      <Button
                        aria-label={`删除第 ${index + 1} 行`}
                        onClick={() => remove(index)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {error ? (
                      <p className="jig-map-error">{error}</p>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>

          {/* 原生滚动条已隐藏，换成与 JIG 表格同一套的覆盖式浮层 */}
          <JigScrollbar targetRef={listRef} />
        </div>

        <DialogFooter className="jig-map-footer mx-0 mb-0">
          {confirmDiscard ? (
            <>
              <span className="dialog-discard mr-auto">有未保存的修改</span>
              <Button
                onClick={() => setConfirmDiscard(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                继续编辑
              </Button>
              <Button onClick={onClose} size="sm" type="button" variant="destructive">
                放弃修改
              </Button>
            </>
          ) : sorting ? (
            <>
              <span className="jig-toolbar-spacer" />
              <Button onClick={() => setSorting(false)} size="sm" type="button">
                完成
              </Button>
              <Button onClick={requestClose} size="sm" type="button" variant="outline">
                取消
              </Button>
            </>
          ) : (
            <>
              <Button onClick={add} size="sm" type="button" variant="outline">
                <Plus data-icon="inline-start" />
                新增
              </Button>
              <Button
                disabled={pairs.length < 2}
                onClick={() => setSorting(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                排序
              </Button>
              <Button onClick={restore} size="sm" type="button" variant="ghost">
                恢复默认
              </Button>
              <span className="jig-toolbar-spacer" />
              {errorCount > 0 ? (
                <span className="jig-map-error-count">
                  {errorCount} 处需要修正
                </span>
              ) : null}
              <Button disabled={errorCount > 0} onClick={save} size="sm" type="button">
                保存
              </Button>
              <Button onClick={requestClose} size="sm" type="button" variant="outline">
                取消
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
