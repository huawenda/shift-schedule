import { useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { DIMENSION_LABEL } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import { normalizeKey } from '../core/normalize'
import type { EntityRef, LookupDimension, LookupView } from '../core/types'
import { LookupFootnote } from './LookupFootnote'

interface BrowseItem {
  ref: EntityRef
  label: string
  secondary: string
}

/** 每个维度能筛的字段不同，placeholder 跟着变，别让人以为英寸维度能按厂家筛 */
const FILTER_PLACEHOLDER: Record<LookupDimension, string> = {
  inch: '筛选英寸，如 77/48',
  model: '筛选型号，如 FY',
  fspm: '筛选 P 号 / 厂家 / 材质',
  jig: '筛选 JIG P/N / Recipe',
}

/**
 * 一个维度的全部条目。
 *
 * 四个维度共用同一个组件，只换数据源：`inch` 取 byInch、`model` 取 byModel、
 * `fspm` 取属性表 + 反向引用数、`jig` 取聚合后的 JigEntry。
 * 不写四套页面 —— 卡片的形状、筛选、点击行为完全一致。
 */
function buildItems(dim: LookupDimension, index: LookupIndex): BrowseItem[] {
  const items: BrowseItem[] = []

  switch (dim) {
    case 'inch':
      for (const [inch, groups] of index.byInch) {
        const models = new Set<string>()
        for (const group of groups) for (const model of group.models) models.add(model)
        items.push({
          ref: { type: 'inch', key: inch },
          label: inch,
          secondary: `${groups.length} 组合 · ${models.size} 型号`,
        })
      }
      break
    case 'model':
      // byModel 的 key 已归一化，label 用 group.models 里的原始写法
      for (const [key, group] of index.byModel) {
        const model = group.models.find(item => normalizeKey(item) === key) ?? key
        items.push({
          ref: { type: 'model', key: model },
          label: model,
          secondary: `${group.inch} · ${group.jigPn} · Recipe ${group.recipe}`,
        })
      }
      break
    case 'fspm':
      for (const [id, fspm] of index.fspm) {
        const refs = index.byFspm.get(normalizeKey(id)) ?? []
        const groups = new Set(refs.map(ref => ref.groupId))
        items.push({
          ref: { type: 'fspm', key: fspm.id },
          label: fspm.id,
          secondary: `${fspm.size}" · ${fspm.maker} · ${fspm.material} · ${groups.size} 组引用`,
        })
      }
      break
    case 'jig':
      for (const entry of index.jigs) {
        items.push({
          ref: { type: 'jig', key: entry.jigPn },
          label: entry.jigPn,
          secondary: `Recipe ${entry.recipe} · ${entry.inches.join(' / ')} · ${entry.models.length} 型号`,
        })
      }
      break
  }

  return items.sort((a, b) => a.label.localeCompare(b.label))
}

interface BrowseBoardProps {
  dim: LookupDimension
  index: LookupIndex
  onNavigate: (view: LookupView) => void
  onBack: () => void
}

/** 预设展示页的单个维度：筛选 + 卡片网格，点卡片等价于 command 选中该实体 */
export function BrowseBoard({ dim, index, onNavigate, onBack }: BrowseBoardProps) {
  const [filter, setFilter] = useState('')
  const items = useMemo(() => buildItems(dim, index), [dim, index])

  const keyword = normalizeKey(filter)
  const visible = keyword
    ? items.filter(item => normalizeKey(`${item.label} ${item.secondary}`).includes(keyword))
    : items

  return (
    <div className="lookup-browse">
      <div className="lookup-browse-head">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <ArrowLeft />
          总览
        </Button>
        <h2 className="lookup-browse-title">{DIMENSION_LABEL[dim]}</h2>
        <span className="lookup-browse-count">
          {keyword ? `${visible.length} / ${items.length}` : items.length} 项
        </span>
      </div>

      <div className="lookup-filter-input">
        <Search aria-hidden="true" className="lookup-input-icon" />
        <Input
          aria-label="筛选当前维度"
          className="lookup-input h-8 bg-background pr-8 pl-8"
          onChange={event => setFilter(event.target.value)}
          placeholder={FILTER_PLACEHOLDER[dim]}
          spellCheck={false}
          value={filter}
        />
        {filter ? (
          <Button
            aria-label="清空筛选"
            className="lookup-clear"
            onClick={() => setFilter('')}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="lookup-muted">没有匹配的条目</p>
      ) : (
        <div className="lookup-grid">
          {visible.map(item => (
            <button
              className="lookup-item"
              key={`${item.ref.type}:${item.ref.key}`}
              onClick={() =>
                onNavigate({ kind: 'entity', type: item.ref.type, key: item.ref.key })
              }
              type="button"
            >
              <span className="lookup-item-label">{item.label}</span>
              <span className="lookup-item-sub">{item.secondary}</span>
            </button>
          ))}
        </div>
      )}

      <LookupFootnote index={index} />
    </div>
  )
}
