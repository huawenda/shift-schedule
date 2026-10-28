import { useEffect, useState } from 'react'
import {
  MAX_CUSTOM_PATTERNS,
  type CustomPattern,
  type PatternLookup,
  type ShiftPattern
} from '../data/patterns'
import { patternUsage, type Roster } from '../data/roster'
import { SHIFT_META, shiftToneClass, type ShiftType } from '../data/shifts'
import { PatternEditor } from './PatternEditor'

interface PatternListProps {
  roster: Roster
  lookup: PatternLookup
  onSavePattern: (pattern: CustomPattern) => void
  onRemovePattern: (patternId: string) => void
  onNotice: (text: string) => void
}

/** 24 格的缩略色条：一眼看出这条班序的节奏（4 夜 2 休 4 白 2 休…） */
function ShiftBar({ shifts }: { shifts: ShiftType[] }) {
  return (
    <span aria-hidden="true" className="pattern-bar">
      {shifts.map((shift, index) => (
        <i className={`pattern-bar-seg ${shiftToneClass(shift)}`} key={index} />
      ))}
    </span>
  )
}

/** 只读预览用的 24 格，和编辑器同一套格子样式，只是不能点 */
function PatternGrid({ shifts }: { shifts: ShiftType[] }) {
  return (
    <div className="pattern-grid">
      {[0, 12].map(start => (
        <div className="pattern-grid-row" key={start}>
          {Array.from({ length: 12 }, (_, offset) => start + offset).map(index => (
            <span
              className={`shift-cell is-readonly ${shiftToneClass(shifts[index])}`}
              key={index}
              title={`第 ${index + 1} 天：${SHIFT_META[shifts[index]].label}`}
            >
              <span className="shift-cell-num">{index + 1}</span>
              <span className="shift-cell-text">{SHIFT_META[shifts[index]].short}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * 设置页的「班序」区块。
 *
 * 内置 13 条只读（点开看 24 格，不改）；自建的可以改、可以删。
 * 删除是不可逆操作，而且会连带删掉挂在上面的成员，所以要输入班序名字才放行。
 */
export function PatternList({ roster, lookup, onSavePattern, onRemovePattern, onNotice }: PatternListProps) {
  // 内置与自建分开记：内置共用一个预览区（在色条卡片下方），
  // 自建的详情直接展开在**它自己那一行下面**，避免详情跑到别的分组里去。
  const [builtinPreviewId, setBuiltinPreviewId] = useState<string | null>(null)
  const [customPreviewId, setCustomPreviewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ pattern?: CustomPattern } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CustomPattern | null>(null)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (!pendingDelete) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPendingDelete(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDelete])

  // 正在预览的班序被删掉时自动收起
  useEffect(() => {
    if (builtinPreviewId && !lookup.has(builtinPreviewId)) setBuiltinPreviewId(null)
    if (customPreviewId && !lookup.has(customPreviewId)) setCustomPreviewId(null)
  }, [lookup, builtinPreviewId, customPreviewId])

  const builtinPreview: ShiftPattern | undefined = builtinPreviewId ? lookup.get(builtinPreviewId) : undefined
  const atLimit = roster.patterns.length >= MAX_CUSTOM_PATTERNS

  function startDelete(pattern: CustomPattern) {
    setPendingDelete(pattern)
    setConfirmText('')
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const usage = patternUsage(roster, pendingDelete.id)
    onRemovePattern(pendingDelete.id)
    onNotice(
      usage.members.length > 0
        ? `已删除班序「${pendingDelete.name}」，同时移除 ${usage.members.length} 位成员（${usage.members.join('、')}）与 ${usage.overrides} 条改班记录。`
        : `已删除班序「${pendingDelete.name}」。`
    )
    setPendingDelete(null)
    setConfirmText('')
  }

  return (
    <div className="pattern-block">
      <div className="pattern-group">
        <p className="pattern-group-label">
          <span>内置 {lookup.builtin.length} 条 · 只读，点开看 24 格</span>
        </p>
        <div className="pattern-chips">
          {lookup.builtin.map(pattern => (
            <button
              aria-pressed={builtinPreviewId === pattern.id}
              className={`pattern-chip${builtinPreviewId === pattern.id ? ' is-on' : ''}`}
              key={pattern.id}
              type="button"
              onClick={() => setBuiltinPreviewId(builtinPreviewId === pattern.id ? null : pattern.id)}
            >
              <span className="pattern-chip-name">{pattern.id}</span>
              <ShiftBar shifts={pattern.shifts} />
            </button>
          ))}
        </div>
      </div>

      {builtinPreview ? (
        <div className="pattern-preview">
          <div className="pattern-preview-head">
            <span className="pattern-preview-title">{lookup.labelOf(builtinPreview.id)}</span>
            <span className="pattern-preview-note">内置班序只读，要改请新建一条</span>
          </div>
          <PatternGrid shifts={builtinPreview.shifts} />
        </div>
      ) : null}

      <div className="pattern-group">
        <p className="pattern-group-label">
          <span>自建班序 {roster.patterns.length} / {MAX_CUSTOM_PATTERNS}</span>
          {atLimit ? <span>已达上限，删掉一条才能再加</span> : null}
        </p>

        {roster.patterns.length === 0 ? (
          <p className="member-editor-empty">还没有自建班序。点下面的「新建班序」，照着 24 格填一条。</p>
        ) : (
          <div className="pattern-rows">
            {roster.patterns.map(pattern => {
              const usage = patternUsage(roster, pattern.id)
              const open = customPreviewId === pattern.id
              return (
                <div className="pattern-item" key={pattern.id}>
                  <div className={`pattern-row${open ? ' is-open' : ''}`}>
                    <span className="pattern-row-name" title={pattern.name}>{pattern.name}</span>
                    <ShiftBar shifts={pattern.shifts} />
                    <span className="pattern-row-usage">
                      {usage.members.length > 0 ? `${usage.members.length} 人` : '未使用'}
                    </span>
                    <div className="pattern-row-actions">
                      <button
                        aria-expanded={open}
                        className="btn btn-quiet"
                        type="button"
                        onClick={() => setCustomPreviewId(open ? null : pattern.id)}
                      >
                        {open ? '收起' : '查看'}
                      </button>
                      <button
                        className="btn btn-quiet"
                        type="button"
                        onClick={() => setEditing({ pattern })}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn-quiet"
                        type="button"
                        onClick={() => startDelete(pattern)}
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {open ? (
                    <div className="pattern-preview pattern-preview-inline">
                      <PatternGrid shifts={pattern.shifts} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <button
          className="btn btn-add"
          disabled={atLimit}
          type="button"
          onClick={() => setEditing({})}
        >
          新建班序
        </button>
      </div>

      {editing ? (
        <PatternEditor
          existing={roster.patterns}
          pattern={editing.pattern}
          onClose={() => setEditing(null)}
          onSave={pattern => {
            onSavePattern(pattern)
            onNotice(`已保存班序「${pattern.name}」，24 格已全量生效（含已过去的月份）。`)
            setEditing(null)
            setBuiltinPreviewId(null)
            setCustomPreviewId(pattern.id)
          }}
        />
      ) : null}

      {pendingDelete ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setPendingDelete(null)}>
          <section
            aria-label="删除班序"
            aria-modal="true"
            className="dialog dialog-narrow"
            role="dialog"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="dialog-head">
              <div>
                <h2 className="dialog-title">删除班序「{pendingDelete.name}」？</h2>
                <p className="dialog-sub">此操作不可撤销</p>
              </div>
              <button className="btn btn-quiet" type="button" onClick={() => setPendingDelete(null)}>关闭</button>
            </header>

            <div className="dialog-body">
              {(() => {
                const usage = patternUsage(roster, pendingDelete.id)
                if (usage.members.length === 0) {
                  return <p className="settings-hint">目前没有成员挂在这条班序上，删除后只影响这条班序本身。</p>
                }
                return (
                  <>
                    <p className="settings-hint">
                      挂在这条班序上的 {usage.members.length} 位成员会被一并删除：
                    </p>
                    <p className="confirm-names">{usage.members.join('、')}</p>
                    <p className="settings-hint">他们的 {usage.overrides} 条改班记录也会被清理。</p>
                  </>
                )
              })()}
              <p className="settings-hint">
                如果只是想调整 24 格的规律，用「编辑」；只有确实不再需要这条班序时才删除。
              </p>
              <label className="confirm-label">
                <span>输入「{pendingDelete.name}」以确认</span>
                <input
                  aria-label={`输入 ${pendingDelete.name} 以确认删除`}
                  className="input"
                  value={confirmText}
                  onChange={event => setConfirmText(event.target.value)}
                />
              </label>
            </div>

            <footer className="dialog-foot">
              <span />
              <div className="dialog-actions">
                <button className="btn" type="button" onClick={() => setPendingDelete(null)}>取消</button>
                <button
                  className="btn btn-danger"
                  disabled={confirmText.trim() !== pendingDelete.name}
                  type="button"
                  onClick={confirmDelete}
                >
                  删除班序
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
