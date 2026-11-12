import { useEffect, useRef, useState } from 'react'

import { lookupIndex } from '../core/instance'
import type { LookupView } from '../core/types'
import { EntityResult } from './EntityResult'
import { LookupCommand } from './LookupCommand'
import { LookupEmpty } from './LookupEmpty'

interface LookupScreenProps {
  view: LookupView
  onNavigate: (view: LookupView) => void
}

/**
 * 速查页：一个常驻 command + 结果区。
 *
 * 输入框文字是组件内状态，选中的实体在 hash 里 —— 刷新、前进后退、深链
 * 都由 `view` 驱动；`useEffect` 把它同步回输入框。
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
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">生产速查</h1>
          <p className="canvas-sub">GLS 型号 · JIG P/N · Recipe · FSPM · INCH</p>
        </div>
      </div>

      <div className="canvas-flow" ref={flowRef}>
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

        {view.kind === 'entity' ? (
          <EntityResult index={lookupIndex} onNavigate={onNavigate} view={view} />
        ) : (
          <LookupEmpty
            index={lookupIndex}
            onPick={ref => onNavigate({ kind: 'entity', type: ref.type, key: ref.key })}
          />
        )}
      </div>
    </div>
  )
}
