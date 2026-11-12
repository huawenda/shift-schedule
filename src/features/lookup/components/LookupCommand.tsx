import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

import { ENTITY_LABEL } from '../core/display'
import { parseEntityQuery, searchEntities, type EntityHit } from '../core/entities'
import type { LookupIndex } from '../core/indexes'
import type { EntityRef } from '../core/types'

interface LookupCommandProps {
  index: LookupIndex
  query: string
  onQueryChange: (query: string) => void
  onSelect: (ref: EntityRef) => void
  onClear: () => void
}

/**
 * 统一 command：一个输入框搜全部实体。
 *
 * 不再有「按型号 / 按 JIG」两个模式 —— 输入先匹配六类实体，建议列表按类型分组，
 * 顺序由 `searchEntities` 的「匹配度 → 类型优先级」决定（`7748` 首项是 INCH）。
 * 键盘沿用 combobox 标准行为；选中才写 hash，输入过程只更新组件内文字。
 */
export function LookupCommand({
  index,
  query,
  onQueryChange,
  onSelect,
  onClear,
}: LookupCommandProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // 前缀（fspm:P467）只限定类型，判断「有没有输入」要看冒号后面的部分
  const parsed = parseEntityQuery(query)
  const hasQuery = parsed.query.trim().length > 0

  const options = useMemo<EntityHit[]>(
    () => (hasQuery ? searchEntities(index, query) : []),
    [hasQuery, index, query],
  )

  useEffect(() => {
    setActive(-1)
  }, [query])

  // Ctrl/⌘+K 聚焦：与页内常驻输入框共用同一个元素，不做第二个浮层
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      inputRef.current?.focus()
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const showList = open && hasQuery

  function choose(hit: EntityHit) {
    setOpen(false)
    setActive(-1)
    onSelect(hit.ref)
    onQueryChange(hit.ref.key)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      if (options.length > 0) setActive(current => (current + 1) % options.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      if (options.length > 0) {
        setActive(current => (current <= 0 ? options.length - 1 : current - 1))
      }
      return
    }
    if (event.key === 'Enter') {
      if (!showList || options.length === 0) return
      event.preventDefault()
      choose(options[active >= 0 ? active : 0])
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  function clear() {
    setOpen(false)
    setActive(-1)
    onClear()
    inputRef.current?.focus()
  }

  return (
    <div className="lookup-toolbar">
      <Popover open={showList} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="lookup-search" ref={searchRef}>
            <Search aria-hidden="true" className="lookup-input-icon" />
            <Input
              aria-activedescendant={
                showList && active >= 0 ? `lookup-option-${active}` : undefined
              }
              aria-autocomplete="list"
              aria-controls={showList && options.length > 0 ? 'lookup-suggestions' : undefined}
              aria-expanded={showList}
              aria-haspopup="listbox"
              aria-label="搜索型号、JIG、Recipe、FSPM 或英寸组合"
              autoComplete="off"
              className="lookup-input h-9 rounded-md bg-background pr-9 pl-9"
              onChange={event => {
                onQueryChange(event.target.value)
                setOpen(true)
              }}
              onClick={() => {
                // 输入框还保持着焦点、浮层已被 Esc / 选中关掉时，再点一下要能重新打开
                if (hasQuery) setOpen(true)
              }}
              onFocus={() => {
                if (hasQuery) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder="型号 / JIG / Recipe / FSPM / 英寸，如 FY、7748G、P467、7748"
              ref={inputRef}
              role="combobox"
              spellCheck={false}
              value={query}
            />
            {query ? (
              <Button
                aria-label="清空查询"
                className="lookup-clear"
                onClick={clear}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="lookup-suggest w-[640px] max-w-[calc(100vw-48px)] rounded-lg bg-background p-1"
          onFocusOutside={event => {
            const target = event.detail.originalEvent.target
            if (target instanceof Node && searchRef.current?.contains(target)) {
              event.preventDefault()
            }
          }}
          onMouseLeave={() => setActive(-1)}
          onOpenAutoFocus={event => event.preventDefault()}
          onPointerDownOutside={event => {
            const target = event.detail.originalEvent.target
            if (target instanceof Node && searchRef.current?.contains(target)) {
              event.preventDefault()
            }
          }}
          sideOffset={6}
        >
          {options.length === 0 ? (
            <p className="lookup-suggest-empty">没有匹配的型号 / JIG / Recipe / FSPM / 英寸</p>
          ) : (
            <ul id="lookup-suggestions" role="listbox">
              {options.map((hit, i) => {
                const newGroup = i === 0 || options[i - 1].ref.type !== hit.ref.type
                return (
                  <Fragment key={`${hit.ref.type}:${hit.ref.key}`}>
                    {newGroup ? (
                      <li className="lookup-option-group" role="presentation">
                        {ENTITY_LABEL[hit.ref.type]}
                      </li>
                    ) : null}
                    <li
                      aria-selected={i === active}
                      className="lookup-option"
                      data-active={i === active}
                      id={`lookup-option-${i}`}
                      onClick={() => choose(hit)}
                      onMouseDown={event => event.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      role="option"
                    >
                      <span className="lookup-option-primary">
                        <Highlight query={parsed.query} text={hit.label} />
                      </span>
                      <span className="lookup-option-secondary">{hit.secondary}</span>
                    </li>
                  </Fragment>
                )
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <span className="lookup-search-hint">Ctrl/⌘+K 聚焦 · 支持 fspm:P467 限定类型</span>
    </div>
  )
}

/** 命中片段高亮；查询是口径之外的写法（如 7748 对 77/48）时自然不高亮 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const index = text.toUpperCase().indexOf(q.toUpperCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}
