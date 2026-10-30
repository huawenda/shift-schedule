import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectGroup {
  /** 分组小标题；不传就不画标题（只有一组时用） */
  label?: string
  options: SelectOption[]
}

interface SelectProps {
  ariaLabel: string
  className?: string
  disabled?: boolean
  groups: SelectGroup[]
  value: string
  onChange: (value: string) => void
}

type Row =
  | { kind: 'group'; label: string }
  | { kind: 'option'; index: number; option: SelectOption }

interface Placement {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

/**
 * 下拉选择：自己画弹层，替掉原生 `<select>`。
 *
 * 为什么不用原生控件：闭合状态的框能靠 `appearance: none` 改，但**弹层改不了** ——
 * Chromium / WebView2 用的是系统列表：直角、无内边距、选中行一条死灰，和这一页
 * 「白底 + 1px 细线 + 6px 圆角」的控件完全不是一套语言。
 *
 * 所以这里只做两件事：触发按钮与 `.input` 完全同款（同高、同边、同圆角、同字号），
 * 弹层用面板那套边框 + 一层极淡的投影。不做圆角气泡、不做强调色高亮条 ——
 * 那一套放在成员表这种密集表格里会非常跳。
 *
 * 弹层走 portal + `position: fixed`：成员表在 `.canvas-flow` 里滚动，
 * 就地绝对定位会被容器的 `overflow` 裁掉（最后几行的弹层只剩半截）。
 */
export function Select({ ariaLabel, className, disabled, groups, onChange, value }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const listId = useId().replace(/:/g, '')

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    let index = 0
    for (const group of groups) {
      if (group.options.length === 0) continue
      if (group.label) out.push({ kind: 'group', label: group.label })
      for (const option of group.options) {
        out.push({ kind: 'option', index, option })
        index += 1
      }
    }
    return out
  }, [groups])

  const options = useMemo(
    () => rows.flatMap(row => (row.kind === 'option' ? [row.option] : [])),
    [rows]
  )

  const currentIndex = Math.max(0, options.findIndex(option => option.value === value))
  const currentLabel = options[currentIndex]?.label ?? value

  /** 贴着触发按钮定位：下方放不下就翻到上方，高度按可用空间收口 */
  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const flip = below < 240 && above > below
    setPlacement({
      left: rect.left,
      width: rect.width,
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(132, Math.min(264, flip ? above : below))
    })
  }, [])

  const openList = useCallback(() => {
    place()
    setActive(currentIndex)
    setOpen(true)
  }, [currentIndex, place])

  const close = useCallback(() => setOpen(false), [])

  const commit = useCallback(
    (option: SelectOption) => {
      setOpen(false)
      triggerRef.current?.focus()
      if (option.value !== value) onChange(option.value)
    },
    [onChange, value]
  )

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }

    // 面板滚动时弹层跟着走（关掉会让「滚一下候选就没了」），但弹层自己内部的滚动不算
    function onScroll(event: Event) {
      if (popupRef.current?.contains(event.target as Node)) return
      place()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  // 键盘上下移动时把当前项滚进可视区
  useEffect(() => {
    if (!open) return
    popupRef.current
      ?.querySelector('.select-option.is-active')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openList()
      }
      return
    }

    const last = options.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive(index => Math.min(last, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive(index => Math.max(0, index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(last)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (options[active]) commit(options[active])
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        close()
        break
      default:
        break
    }
  }

  return (
    <>
      <button
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        role="combobox"
        className={`select-trigger${className ? ` ${className}` : ''}`}
        disabled={disabled}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{currentLabel}</span>
        <svg aria-hidden="true" className="select-arrow" viewBox="0 0 12 12">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </button>

      {open && placement
        ? createPortal(
          <div
            aria-label={ariaLabel}
            className="select-popup"
            id={listId}
            ref={popupRef}
            role="listbox"
            style={{
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight
            }}
          >
            {rows.map(row =>
              row.kind === 'group' ? (
                <div className="select-group" key={`group-${row.label}`} role="presentation">
                  {row.label}
                </div>
              ) : (
                <div
                  aria-selected={row.option.value === value}
                  className={[
                    'select-option',
                    row.option.value === value ? 'is-selected' : '',
                    row.index === active ? 'is-active' : ''
                  ].filter(Boolean).join(' ')}
                  id={`${listId}-${row.index}`}
                  key={row.option.value}
                  role="option"
                  // 按下时不抢焦点：焦点留在触发按钮上，键盘操作才不会断
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => setActive(row.index)}
                  onClick={() => commit(row.option)}
                >
                  {row.option.label}
                </div>
              )
            )}
          </div>,
          document.body
        )
        : null}
    </>
  )
}
