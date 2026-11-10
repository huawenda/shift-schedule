import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { normalizeKey } from '../core/normalize'
import { searchJigs, searchModels, type JigEntry, type LookupIndex } from '../core/indexes'
import type { LookupMode, LookupSelection } from '../core/types'

interface Option {
  key: string
  selection: LookupSelection
  primary: string
  secondary: string
}

interface LookupSearchProps {
  mode: LookupMode
  query: string
  index: LookupIndex
  onModeChange: (mode: LookupMode) => void
  onQueryChange: (query: string) => void
  onSelect: (selection: LookupSelection) => void
  onClear: () => void
}

const PLACEHOLDER: Record<LookupMode, string> = {
  model: '输入 GLS 型号，如 FY / 7X',
  jig: '输入 JIG P/N 或 Recipe，如 7748G / 31(10)',
}

/** 输入框 + 模式页签 + 建议浮层；键盘操作按 combobox 标准行为 */
export function LookupSearch({
  mode,
  query,
  index,
  onModeChange,
  onQueryChange,
  onSelect,
  onClear,
}: LookupSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const hasQuery = normalizeKey(query).length > 0

  const options = useMemo<Option[]>(() => {
    if (!hasQuery) return []
    if (mode === 'model') {
      return searchModels(index, query).map(hit => ({
        key: `model:${hit.model}`,
        selection: { mode: 'model', key: hit.model },
        primary: hit.model,
        secondary: `${hit.group.inch} · ${hit.group.jigPn} · Recipe ${hit.group.recipe}`,
      }))
    }
    return searchJigs(index, query).map(entry => ({
      key: `jig:${entry.jigPn}`,
      selection: { mode: 'jig', key: jigKeyOf(entry, query) },
      primary: entry.jigPn,
      secondary: `Recipe ${entry.recipe} · ${entry.inches.join(' / ')} · ${entry.models.length} 个型号`,
    }))
  }, [hasQuery, index, mode, query])

  useEffect(() => {
    setActive(-1)
  }, [mode, query])

  const showList = open && hasQuery

  function choose(option: Option) {
    setOpen(false)
    setActive(-1)
    onSelect(option.selection)
    onQueryChange(option.selection.key)
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
      <Tabs
        className="lookup-tabs"
        onValueChange={value => onModeChange(value as LookupMode)}
        value={mode}
      >
        <TabsList className="lookup-tabs-list h-9">
          <TabsTrigger value="model">按 GLS 型号</TabsTrigger>
          <TabsTrigger value="jig">按 JIG / Recipe</TabsTrigger>
        </TabsList>
      </Tabs>

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
              autoComplete="off"
              className="lookup-input h-9 rounded-md bg-background pr-9 pl-9"
              onChange={event => {
                onQueryChange(event.target.value)
                setOpen(true)
              }}
              onClick={() => {
                // 输入框还保持着焦点、浮层已被 Esc/选中关掉时，再点一下要能重新打开
                if (hasQuery) setOpen(true)
              }}
              onFocus={() => {
                if (hasQuery) setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER[mode]}
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
            <p className="lookup-suggest-empty">
              没有匹配的{mode === 'model' ? '型号' : ' JIG P/N 或 Recipe'}
            </p>
          ) : (
            <ul id="lookup-suggestions" role="listbox">
              {options.map((option, i) => (
                <li
                  aria-selected={i === active}
                  className="lookup-option"
                  data-active={i === active}
                  id={`lookup-option-${i}`}
                  key={option.key}
                  onClick={() => choose(option)}
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  role="option"
                >
                  <span className="lookup-option-primary">
                    <Highlight query={query} text={option.primary} />
                  </span>
                  <span className="lookup-option-secondary">{option.secondary}</span>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <span className="lookup-search-hint">支持型号 / JIG / Recipe 部分匹配</span>
    </div>
  )
}

/** 用户敲的是 Recipe 就保留 Recipe 作为深链 key，避免输入框自己跳成 JIG P/N */
function jigKeyOf(entry: JigEntry, query: string): string {
  return normalizeKey(query) === normalizeKey(entry.recipe) ? entry.recipe : entry.jigPn
}

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
