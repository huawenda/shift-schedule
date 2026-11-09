import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'

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

  const errors = useMemo(() => validateMappingPairs(pairs), [pairs])
  const errorCount = Object.keys(errors).length

  /**
   * 报错信息在行内，列表又是可滚动的 —— 用户在末尾新增一行、填了重复型号，
   * 红框确实出现了，但提示文字往往落在可视区之外，表现就是「保存按钮灰了
   * 但不知道为什么」。所以第一处出错时自动滚过去。
   */
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  /* ------------------------------------------------------------ 拖拽排序
   *
   * 用 **pointer events + setPointerCapture**，不是 HTML5 drag。
   *
   * 本项目上一轮已全局禁用 HTML5 原生拖拽（main.tsx 在 document 捕获阶段
   * 取消 dragstart），以免拖链接时浮出 URL 预览卡片。成员表的排序
   * （MemberRowsEditor）走的是 pointer events，与 HTML5 drag 是两套机制，
   * 不受影响 —— 映射表沿用同一套，因此**不需要为 JIG 开任何拖拽白名单**。
   *
   * 步长固定：行高 44 + 间距 8 = 52。被拖行跟手，夹在它和目标之间的行
   * 让出一条；拖到滚动区上下缘自动滚。
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
    event: React.PointerEvent<HTMLButtonElement>
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

  function onSortPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!sortRef.current) return
    event.preventDefault()
    updateSort(event.clientY)
  }

  function onSortPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
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
    <Dialog onOpenChange={open => { if (!open) onClose() }} open>
      <DialogContent className="jig-map-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>型号尺寸匹配</DialogTitle>
          <DialogDescription>
            决定「对应尺寸」列怎么填。改了之后所有视图立刻按新规则重算。
          </DialogDescription>
        </DialogHeader>

        <div className="jig-map">
          <div className="jig-map-head">
            <span className="jig-map-col jig-map-col--grip" />
            <span className="jig-map-col">型号</span>
            <span className="jig-map-col">对应尺寸</span>
            <span className="jig-map-col jig-map-col--act" />
          </div>

          <div className="jig-map-body" ref={listRef}>
            {pairs.length === 0 ? (
              <p className="jig-map-empty">
                还没有任何映射规则，点下方「新增」开始添加。
              </p>
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
                    style={{ transform: sortTransform(index) }}
                  >
                    <button
                      aria-label={`拖动第 ${index + 1} 行调整顺序`}
                      className="jig-map-grip"
                      type="button"
                      onPointerDown={event => onSortPointerDown(index, event)}
                      onPointerMove={onSortPointerMove}
                      onPointerUp={onSortPointerUp}
                      onPointerCancel={onSortPointerUp}
                    >
                      <GripVertical />
                    </button>
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
                        aria-label={`第 ${index + 1} 行上移`}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        aria-label={`第 ${index + 1} 行下移`}
                        disabled={index === pairs.length - 1}
                        onClick={() => move(index, index + 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDown />
                      </Button>
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
        </div>

        <DialogFooter className="jig-map-footer">
          <Button onClick={add} size="sm" type="button" variant="outline">
            <Plus data-icon="inline-start" />
            新增
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
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
