import { useEffect, useMemo, useState } from 'react'
import { createRow, fromRows, MemberRowsEditor, toRows, type MemberRow } from '../components/MemberRowsEditor'
import { PATTERN_ANCHOR_DATE, PATTERN_CYCLE_LENGTH, PATTERN_IDS } from '../data/patterns'
import { countOverrides, validateMembers, type Member, type Roster } from '../data/roster'

interface SettingsScreenProps {
  roster: Roster
  persisted: boolean
  onSaveMembers: (members: Member[]) => void
  onBackup: () => void
  onRestore: (file: File) => void
  onClearAll: () => void
  onStartWizard: () => void
}

export function SettingsScreen({
  roster,
  persisted,
  onSaveMembers,
  onBackup,
  onRestore,
  onClearAll,
  onStartWizard
}: SettingsScreenProps) {
  const [rows, setRows] = useState<MemberRow[]>(() => toRows(roster.members))
  const [dirty, setDirty] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [removedNotice, setRemovedNotice] = useState('')

  useEffect(() => {
    setRows(toRows(roster.members))
    setDirty(false)
  }, [roster.members])

  const drafts = useMemo(() => fromRows(rows), [rows])
  const errors = useMemo(() => (rows.length === 0 ? [] : validateMembers(drafts)), [drafts, rows.length])

  function update(next: MemberRow[]) {
    setRows(next)
    setDirty(true)
  }

  function save() {
    if (errors.length > 0) return

    const keptIds = new Set(drafts.map(member => member.id))
    const removed = roster.members.filter(member => !keptIds.has(member.id))
    const removedOverrides = removed.reduce((total, member) => total + countOverrides(roster, member.id), 0)

    onSaveMembers(drafts)
    setDirty(false)
    setRemovedNotice(
      removed.length > 0
        ? `已保存：删除 ${removed.length} 位成员，连带清理 ${removedOverrides} 条改班记录。`
        : `已保存：${drafts.length} 位成员。`
    )
  }

  return (
    <div className="canvas">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">设置</h1>
          <p className="canvas-sub">成员与班序、备份、清空数据</p>
        </div>
      </div>

      {!persisted ? (
        <p className="banner banner-warn" role="status">
          当前浏览器不允许本机存储，改动只保留在内存里，刷新就会丢。请用顶栏的「导出备份」及时保存。
        </p>
      ) : null}

      {removedNotice ? (
        <p className="banner" role="status">
          {removedNotice}
          <button className="banner-close" type="button" onClick={() => setRemovedNotice('')}>知道了</button>
        </p>
      ) : null}

      <section className="settings-section">
        <div className="settings-label">
          <h2>成员</h2>
          <p>姓名自定，人数不限；同一班序可以挂多人，这些人每天的班次完全一致。</p>
          <p className="settings-meta">
            {PATTERN_IDS.length} 条班序 · 每条 {PATTERN_CYCLE_LENGTH} 天循环 · 起算日 {PATTERN_ANCHOR_DATE}
          </p>
        </div>

        <div className="settings-panel">
          <MemberRowsEditor rows={rows} onChange={update} />

          {errors.length > 0 ? (
            <ul className="error-list" role="alert">
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          ) : null}

          <div className="settings-actions">
            <button className="btn btn-primary" disabled={!dirty || errors.length > 0} type="button" onClick={save}>
              保存成员设置
            </button>
            {rows.length === 0 ? (
              <button className="btn" type="button" onClick={onStartWizard}>用向导重新配置</button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <h2>备份</h2>
          <p>数据只存在这台电脑的浏览器里。换电脑、清缓存前请先导出。</p>
          <p className="settings-meta">当前 {roster.members.length} 位成员 · {roster.overrides.length} 条改班记录</p>
        </div>

        <div className="settings-panel">
          <div className="settings-actions">
            <button className="btn" type="button" onClick={onBackup}>导出备份</button>
            <label className="btn btn-file">
              导入备份
              <input
                accept="application/json,.json"
                className="visually-hidden"
                type="file"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) onRestore(file)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          <p className="settings-hint">导入会覆盖当前成员与改班记录；旧版（v1）备份会按姓名对照现有成员。</p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <h2>清空数据</h2>
          <p>删除本机保存的全部成员与改班记录，回到首次配置状态。此操作不可撤销。</p>
        </div>

        <div className="settings-panel">
          <div className="danger-row">
            <input
              aria-label="输入清空以确认"
              className="input"
              placeholder="输入「清空」以确认"
              value={confirmText}
              onChange={event => setConfirmText(event.target.value)}
            />
            <button
              className="btn btn-danger"
              disabled={confirmText.trim() !== '清空'}
              type="button"
              onClick={() => {
                onClearAll()
                setConfirmText('')
              }}
            >
              清空全部数据
            </button>
          </div>
        </div>
      </section>

      <p className="settings-footnote">
        这是一个纯本地工具：不联网、不需要账号，副本拷到别的电脑上也是独立的。
      </p>
    </div>
  )
}
