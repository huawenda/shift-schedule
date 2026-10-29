import { useEffect, useMemo, useRef, useState } from 'react'
import { fromRows, MemberRowsEditor, toRows, type MemberRow, type PatternOption } from '../components/MemberRowsEditor'
import { PatternList } from '../components/PatternList'
import { ProfileSection } from '../components/ProfileSection'
import { isTauriShell } from '../data/env'
import {
  canChooseBackupDir,
  getBackupDir,
  pickBackupDir,
  resolveDefaultDownloadDir,
  setBackupDir as saveBackupDir
} from '../data/backupDir'
import {
  MAX_CUSTOM_PATTERNS,
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  resolvePatterns,
  type CustomPattern
} from '../data/patterns'
import type { SalaryInput, SelfIdentity } from '../data/profile'
import { countOverrides, getSelf, validateMembers, type Member, type Roster } from '../data/roster'
import {
  getCloseBehavior,
  setCloseBehavior as saveCloseBehavior,
  syncCloseBehaviorToShell,
  type CloseBehavior
} from '../data/windowPrefs'

/** 设置分两页：班序与成员占满屏，个人信息/备份/清空放另一页，各自不再互相挤压 */
export type SettingsTab = 'roster' | 'profile'

const TAB_SUB: Record<SettingsTab, string> = {
  roster: `成员名单与矩阵行顺序`,
  profile: '本人与薪资、备份、清空数据'
}

interface SettingsScreenProps {
  roster: Roster
  persisted: boolean
  /** 进入时落在哪个 tab（由调用方决定；不传就是人员配置） */
  initialTab?: SettingsTab
  onSaveMembers: (members: Member[]) => void
  onSaveSelf: (input: SelfIdentity) => void
  onSaveSalary: (salary: SalaryInput) => void
  onSavePattern: (pattern: CustomPattern) => void
  onRemovePattern: (patternId: string) => void
  onBackup: () => void
  onRestore: (file: File) => void
  onClearAll: () => void
  onStartWizard: () => void
}

/**
 * 设置页：页内两个 tab。
 *
 * 成员表的草稿（`rows` / `dirty`）留在这一层，**切 tab 不会丢** ——
 * 换页只是换渲染分支，受控组件的状态在父组件里，所以不需要「有未保存改动」的拦截。
 */
export function SettingsScreen({
  roster,
  persisted,
  initialTab = 'roster',
  onSaveMembers,
  onSaveSelf,
  onSaveSalary,
  onSavePattern,
  onRemovePattern,
  onBackup,
  onRestore,
  onClearAll,
  onStartWizard
}: SettingsScreenProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [rows, setRows] = useState<MemberRow[]>(() => toRows(roster.members))
  const [dirty, setDirty] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [flash, setFlash] = useState('')
  const [backupDir, setBackupDirState] = useState<string | null>(() => getBackupDir())
  const [closeBehavior, setCloseBehaviorState] = useState<CloseBehavior>(() => getCloseBehavior())
  /** 系统「下载」夹的真实路径（只有壳里拿得到），没设默认目录时用它当占位 */
  const [downloadDir, setDownloadDir] = useState<string | null>(null)
  /** 浏览器里没法让用户挑目录（<a download> 只能进下载夹），所以这一行要置灰 */
  const dirSelectable = canChooseBackupDir()

  useEffect(() => {
    if (!dirSelectable) return
    let cancelled = false
    void resolveDefaultDownloadDir().then(dir => {
      if (!cancelled && dir) setDownloadDir(dir)
    })
    return () => {
      cancelled = true
    }
  }, [dirSelectable])

  /**
   * 页头固定后，内容滚在 `.canvas-flow` 里。
   * 这个容器在切 tab 时会被 React 复用，滚动位置会留着 ——
   * 从人员配置滚到一半切到个人资料，就会停在中间，所以切页统一回顶。
   */
  const flowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (flowRef.current) flowRef.current.scrollTop = 0
  }, [tab])

  useEffect(() => {
    setRows(toRows(roster.members))
    setDirty(false)
  }, [roster.members])

  const self = getSelf(roster)
  const drafts = useMemo(() => fromRows(rows), [rows])
  const errors = useMemo(
    () => (rows.length === 0 ? [] : validateMembers(drafts, roster.patterns, { selfId: self?.id, selfName: self?.name })),
    [drafts, rows.length, roster.patterns, self?.id, self?.name]
  )

  const lookup = useMemo(() => resolvePatterns(roster.patterns), [roster.patterns])

  /** 界面上展示的目录：用户挑的优先，否则用系统下载夹的真实路径 */
  const shownBackupDir = backupDir ?? downloadDir

  /** 下拉里能选的班序：内置在前、自定义在后 */
  const patternOptions = useMemo<PatternOption[]>(
    () => [
      ...lookup.builtin.map(pattern => ({ id: pattern.id, name: lookup.labelOf(pattern.id), builtin: true })),
      ...lookup.custom.map(pattern => ({ id: pattern.id, name: pattern.name, builtin: false }))
    ],
    [lookup]
  )

  async function chooseBackupDir() {
    try {
      const picked = await pickBackupDir(backupDir)
      if (!picked) return
      saveBackupDir(picked)
      setBackupDirState(picked)
      setFlash(`备份将保存到 ${picked}`)
    } catch (error) {
      setFlash(error instanceof Error ? error.message : '选择目录失败')
    }
  }

  function resetBackupDir() {
    saveBackupDir(null)
    setBackupDirState(null)
    setFlash(`已恢复默认：导出会存到 ${downloadDir ?? '系统「下载」文件夹'}。`)
  }

  function changeCloseBehavior(next: CloseBehavior) {
    setCloseBehaviorState(next)
    saveCloseBehavior(next)
    syncCloseBehaviorToShell(next)
  }

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
    setFlash(
      removed.length > 0
        ? `已保存：删除 ${removed.length} 位成员，连带清理 ${removedOverrides} 条改班记录。`
        : `已保存：${drafts.length} 位成员。`
    )
  }

  return (
    /*
     * 设置页两个 tab 都把页头钉住：`.canvas.is-pinned` 让画布自己不滚，
     * 页头之下的内容收进 `.canvas-flow` 单独滚 —— 于是「设置 / 人员配置 / 分页切换」
     * 这条页头在翻成员表、翻备份说明时始终留在原位，分隔线就是滚动区的上边界。
     */
    <div className="canvas is-pinned">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">设置</h1>
          <p className="canvas-sub">{TAB_SUB[tab]}</p>
        </div>

        <div className="canvas-tools">
          <div className="segmented" role="group" aria-label="设置分页">
            <button
              aria-pressed={tab === 'roster'}
              className={`segmented-item${tab === 'roster' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setTab('roster')}
            >
              人员配置
            </button>
            <button
              aria-pressed={tab === 'profile'}
              className={`segmented-item${tab === 'profile' ? ' is-on' : ''}`}
              type="button"
              onClick={() => setTab('profile')}
            >
              个人资料
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-flow" ref={flowRef}>
        {!persisted ? (
          <p className="banner banner-warn" role="status">
            当前环境不允许本机存储，改动只保留在内存里，刷新就会丢。请用顶栏的「导出备份」及时保存。
          </p>
        ) : null}

        {flash ? (
          <p className="banner" role="status">
            {flash}
            <button className="banner-close" type="button" onClick={() => setFlash('')}>知道了</button>
          </p>
        ) : null}

        {tab === 'roster' ? (
          <>
            <section className="settings-section">
              <div className="settings-label">
                <h2>班序</h2>
                <p>班序是 {PATTERN_CYCLE_LENGTH} 天一轮的循环，锚点日 {PATTERN_ANCHOR_DATE}。</p>
                <p>内置 {lookup.builtin.length} 条只读；自建的最多 {MAX_CUSTOM_PATTERNS} 条，可改可删。</p>
              </div>

              <div className="settings-panel">
                <PatternList
                  lookup={lookup}
                  roster={roster}
                  onNotice={setFlash}
                  onRemovePattern={onRemovePattern}
                  onSavePattern={onSavePattern}
                />
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-label">
                <h2>成员</h2>
                <p>姓名自定，人数不限。</p>
                <p>本人行为只读，请在「个人资料」页修改。</p>
                <p className="settings-meta">当前 {roster.members.length} 位成员</p>
              </div>

              <div className="settings-panel">
                <MemberRowsEditor
                  patterns={patternOptions}
                  rows={rows}
                  selfId={self?.id}
                  sortable
                  onChange={update}
                />

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
          </>
        ) : (
          <>
            <ProfileSection
              patterns={patternOptions}
              roster={roster}
              onNotice={setFlash}
              onSaveSalary={onSaveSalary}
              onSaveSelf={onSaveSelf}
            />

            {isTauriShell() ? (
              <section className="settings-section">
                <div className="settings-label">
                  <h2>窗口</h2>
                  <p>关闭主窗口时怎么处理。</p>
                </div>

                <div className="settings-panel">
                  <div className="settings-actions">
                    <div className="segmented" role="group" aria-label="关闭主窗口时">
                      <button
                        aria-pressed={closeBehavior === 'exit'}
                        className={`segmented-item${closeBehavior === 'exit' ? ' is-on' : ''}`}
                        type="button"
                        onClick={() => changeCloseBehavior('exit')}
                      >
                        直接退出
                      </button>
                      <button
                        aria-pressed={closeBehavior === 'tray'}
                        className={`segmented-item${closeBehavior === 'tray' ? ' is-on' : ''}`}
                        type="button"
                        onClick={() => changeCloseBehavior('tray')}
                      >
                        隐藏到托盘
                      </button>
                    </div>
                  </div>
                  <p className="settings-hint">
                    {closeBehavior === 'tray'
                      ? '关闭窗口后程序继续在托盘运行；点任务栏托盘图标可重新打开，退出请用托盘菜单。'
                      : '关闭窗口即退出程序。'}
                  </p>
                </div>
              </section>
            ) : null}

            <section className="settings-section">
              <div className="settings-label">
                <h2>备份</h2>
                {/*
                  存储位置随运行方式不同，文案必须分开写：
                  - 壳里是 WebView2 自己的用户目录（%LOCALAPPDATA%\<bundle id>\EBWebView），
                    跟用户平时用的浏览器毫无关系，清浏览器缓存动不到它；
                  - 浏览器 / 静态版才是那个浏览器的 localStorage，按站点隔离。
                  原来统一写「存在浏览器里、清缓存前请先导出」—— 在壳里两头都不对。
                */}
                <p>
                  {isTauriShell()
                    ? (
                      <>
                        数据只保存在电脑本地，不联网、不上传。
                        <br />
                        卸载、重装或清理应用数据前，请先导出备份。
                      </>
                    )
                    : '数据只保存在这台电脑的这个浏览器里（按站点分开）。换电脑、换浏览器或清除站点数据前，请先导出。'}
                </p>
                <p className="settings-meta">
                  当前 {roster.members.length} 位成员 · {roster.overrides.length} 条改班记录
                </p>
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
                {/* 默认存放目录：只对本机有效，所以不进备份文件，也不跟着换机器走 */}
                <div className="backup-dir">
                  <span className="backup-dir-label">默认存放目录</span>
                  <span
                    className={`backup-dir-path${shownBackupDir ? '' : ' is-default'}`}
                    title={shownBackupDir ?? '系统「下载」文件夹'}
                  >
                    {shownBackupDir ?? '系统「下载」文件夹'}
                  </span>
                  <button
                    className="btn"
                    disabled={!dirSelectable}
                    type="button"
                    onClick={chooseBackupDir}
                  >
                    选择…
                  </button>
                  {backupDir ? (
                    <button className="btn btn-quiet" type="button" onClick={resetBackupDir}>
                      恢复默认
                    </button>
                  ) : null}
                </div>
                <p className="settings-hint">导入会整体覆盖当前数据（含个人信息）；只认当前版本导出的文件。</p>

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
          </>
        )}
      </div>
    </div>
  )
}
