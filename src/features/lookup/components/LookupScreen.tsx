import { useEffect, useRef, useState } from 'react'

import { findJig, findModel } from '../core/indexes'
import { lookupIndex } from '../core/instance'
import { normalizeKey } from '../core/normalize'
import type { LookupMode, LookupSelection } from '../core/types'
import { JigResult } from './JigResult'
import { LookupEmpty } from './LookupEmpty'
import { LookupSearch } from './LookupSearch'
import { ModelResult } from './ModelResult'

interface LookupScreenProps {
  selection: LookupSelection | null
  onSelect: (selection: LookupSelection | null) => void
}

/** 速查页：只读的 GLS 型号 / JIG P/N / Recipe 三向查询 */
export function LookupScreen({ selection, onSelect }: LookupScreenProps) {
  const [mode, setMode] = useState<LookupMode>(selection?.mode ?? 'model')
  const [query, setQuery] = useState(selection?.key ?? '')
  const flowRef = useRef<HTMLDivElement>(null)

  // hash 是唯一真相：刷新 / 前进后退 / 深链进入时，输入框跟着选择走。
  // 选择被清空（切模式 / 点清空）时只清输入，不改当前模式 —— 否则点「按 JIG」会被这里弹回「按型号」。
  useEffect(() => {
    if (selection) {
      setMode(selection.mode)
      setQuery(selection.key)
    } else {
      setQuery('')
    }
    if (flowRef.current) flowRef.current.scrollTop = 0
  }, [selection?.mode, selection?.key])

  const group =
    selection?.mode === 'model' ? findModel(lookupIndex, selection.key) : undefined
  const jig = selection?.mode === 'jig' ? findJig(lookupIndex, selection.key) : undefined
  const notFound = selection && !group && !jig ? selection.key : undefined

  const modelName =
    group?.models.find(item => normalizeKey(item) === normalizeKey(selection?.key ?? '')) ??
    selection?.key ??
    ''

  function changeMode(next: LookupMode) {
    setMode(next)
    setQuery('')
    onSelect(null)
  }

  function pick(next: LookupSelection) {
    setMode(next.mode)
    setQuery(next.key)
    onSelect(next)
  }

  return (
    <div className="canvas is-lookup is-pinned">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">生产速查</h1>
          <p className="canvas-sub">GLS 型号 · JIG P/N · Recipe</p>
        </div>
      </div>

      <div className="canvas-flow" ref={flowRef}>
        <LookupSearch
          index={lookupIndex}
          mode={mode}
          onClear={() => {
            setQuery('')
            onSelect(null)
          }}
          onModeChange={changeMode}
          onQueryChange={setQuery}
          onSelect={pick}
          query={query}
        />

        {group ? (
          <ModelResult group={group} index={lookupIndex} model={modelName} />
        ) : jig ? (
          <JigResult entry={jig} index={lookupIndex} />
        ) : (
          <LookupEmpty index={lookupIndex} notFound={notFound} onPick={pick} />
        )}
      </div>
    </div>
  )
}
