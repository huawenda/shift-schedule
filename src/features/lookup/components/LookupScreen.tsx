import { useEffect, useRef, useState } from 'react'

import { lookupIndex } from '../core/instance'
import type { LookupView } from '../core/types'
import { BrowseBoard } from './BrowseBoard'
import { EntityResult } from './EntityResult'
import { LookupCommand } from './LookupCommand'
import { LookupHome } from './LookupHome'

interface LookupScreenProps {
  view: LookupView
  onNavigate: (view: LookupView) => void
}

/**
 * 速查页：一个常驻 command + 结果区。
 *
 * 输入框文字是组件内状态，选中的实体在 hash 里 —— 刷新、前进后退、深链
 * 都由 `view` 驱动；`useEffect` 把它同步回输入框。
 *
 * **搜索框在滚动区之外**（`.canvas` 的直接子元素，不是 `.canvas-flow` 里的）：
 * 这条线（`.canvas-flow` 的上边框）是「常驻搜索 / 滚动结果」的分界，
 * 往下翻结果时搜索框不动。放在 flow 里的话线会压在搜索框上方，
 * 线上方空着一块、搜索框反而被推到线下面。
 */
export function LookupScreen({ view, onNavigate }: LookupScreenProps) {
  const activeType = view.kind === 'entity' ? view.type : null
  const activeKey = view.kind === 'entity' ? view.key : ''

  const [query, setQuery] = useState(activeKey)
  const flowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(activeKey)
    if (flowRef.current) flowRef.current.scrollTop = 0
  }, [activeType, activeKey])

  return (
    <div className="canvas is-lookup is-pinned">
      <LookupCommand
        index={lookupIndex}
        onClear={() => {
          setQuery('')
          onNavigate({ kind: 'home' })
        }}
        onQueryChange={setQuery}
        onSelect={ref => onNavigate({ kind: 'entity', type: ref.type, key: ref.key })}
        query={query}
      />

      <div className="canvas-flow" ref={flowRef}>
        {view.kind === 'entity' ? (
          <EntityResult index={lookupIndex} onNavigate={onNavigate} view={view} />
        ) : view.kind === 'browse' ? (
          <BrowseBoard
            dim={view.dim}
            index={lookupIndex}
            onBack={() => onNavigate({ kind: 'home' })}
            onNavigate={onNavigate}
          />
        ) : (
          <LookupHome
            index={lookupIndex}
            onBrowse={dim => onNavigate({ kind: 'browse', dim })}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  )
}
