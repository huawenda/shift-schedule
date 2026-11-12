import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { DIMENSION_LABEL } from '../core/display'
import type { LookupIndex } from '../core/indexes'
import { normalizeKey } from '../core/normalize'
import { relationsOf, type Relations } from '../core/relations'
import type { EntityType, LookupDimension, LookupView } from '../core/types'
import { EntityChips } from './EntityChips'
import { FspmResult } from './FspmResult'
import { GroupCard } from './GroupCard'
import { InchResult } from './InchResult'
import { JigResult } from './JigResult'
import { LookupEmpty } from './LookupEmpty'
import { LookupFootnote } from './LookupFootnote'
import { ModelResult } from './ModelResult'

interface EntityResultProps {
  view: Extract<LookupView, { kind: 'entity' }>
  index: LookupIndex
  onNavigate: (view: LookupView) => void
}

/** 实体类型 → 它所属的浏览维度；结果页的「返回」按这个走 */
const ENTITY_DIMENSION: Record<EntityType, LookupDimension> = {
  inch: 'inch',
  model: 'model',
  fspm: 'fspm',
  jig: 'jig',
  recipe: 'jig',
  group: 'inch',
}

/**
 * 实体结果页的共用外壳。
 *
 * 顺序固定为「返回 → 类型专属块 → 关联项 chips → 数据脚注」：
 * - 类型块只回答「这个实体是什么」，不重复渲染 chips / 脚注；
 * - model / jig 仍复用 v1 已验收的结果组件（P3 只搬走它们自带的脚注）；
 * - inch / fspm 用新的专属块，chips 对所有类型统一。
 */
export function EntityResult({ view, index, onNavigate }: EntityResultProps) {
  const relations = relationsOf(index, { type: view.type, key: view.key })

  if (relations.groups.length === 0) {
    return (
      <LookupEmpty
        index={index}
        notFound={view.key}
        onPick={ref => onNavigate({ kind: 'entity', type: ref.type, key: ref.key })}
      />
    )
  }

  const dim = ENTITY_DIMENSION[view.type]

  return (
    <div className="lookup-result">
      <div className="lookup-back-row">
        <Button
          onClick={() => onNavigate({ kind: 'browse', dim })}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          返回 {DIMENSION_LABEL[dim]}
        </Button>
      </div>

      <EntityBody index={index} onNavigate={onNavigate} relations={relations} view={view} />

      <EntityChips
        includeModels={view.type !== 'model' && view.type !== 'inch'}
        onNavigate={onNavigate}
        relations={relations}
      />

      <LookupFootnote index={index} />
    </div>
  )
}

/** 类型专属块：只回答「这个实体是什么」，chips 与脚注由外壳统一加 */
function EntityBody({
  view,
  index,
  relations,
  onNavigate,
}: {
  view: Extract<LookupView, { kind: 'entity' }>
  index: LookupIndex
  relations: Relations
  onNavigate: (view: LookupView) => void
}) {
  switch (view.type) {
    case 'model': {
      const [group] = relations.groups
      if (!group) return null
      const model =
        group.models.find(item => normalizeKey(item) === normalizeKey(view.key)) ?? view.key
      return <ModelResult group={group} index={index} model={model} />
    }
    case 'jig':
    case 'recipe': {
      const [entry] = relations.jigs
      return entry ? <JigResult entry={entry} index={index} /> : null
    }
    case 'group': {
      const [group] = relations.groups
      return group ? <GroupCard fspm={index.fspm} group={group} /> : null
    }
    case 'fspm':
      return <FspmResult index={index} onNavigate={onNavigate} view={view} />
    case 'inch':
      return <InchResult index={index} onNavigate={onNavigate} view={view} />
  }
  return null
}
