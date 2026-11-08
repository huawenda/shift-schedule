import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createRow,
  fromRows,
  MemberRowsEditor,
  toRows,
  UNGROUPED_MEMBERS,
  type MemberRow,
  type PatternOption
} from '../components/MemberRowsEditor'
import { MemberGroupsEditor } from '../components/MemberGroupsEditor'
import { MemberGroupTabs } from '../components/MemberGroupTabs'
import { PatternList } from '../components/PatternList'
import { ProfileSection } from '../components/ProfileSection'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isTauriShell } from '../platform/env'
import { describeImport, mergeImportedMembers, readMemberSheet } from '../data/memberImport'
import {
  canChooseBackupDir,
  getBackupDir,
  pickBackupDir,
  resolveDefaultDownloadDir,
  setBackupDir as saveBackupDir
} from '../platform/backupDir'
import {
  MAX_CUSTOM_PATTERNS,
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  resolvePatterns,
  type CustomPattern
} from '../data/patterns'
import type { SalaryInput, SelfIdentity } from '../data/profile'
import {
  countOverrides,
  createGroupId,
  getSelf,
  orderByGroup,
  validateMembers,
  type Member,
  type MemberGroup,
  type Roster
} from '../data/roster'
import {
  getCloseBehavior,
  setCloseBehavior as saveCloseBehavior,
  syncCloseBehaviorToShell,
  type CloseBehavior
} from '../platform/windowPrefs'
import { Input } from '@/components/ui/input'

/** 设置分两页：班序与成员占满屏，个人信息/备份/清空放另一页，各自不再互相挤压 */
export type SettingsTab = 'roster' | 'profile'

const TAB_SUB: Record<SettingsTab, string> = {
  roster: `成员分组、名单与矩阵行顺序`,
  profile: '本人与薪资、备份、清空数据'
}

interface SettingsScreenProps {
  roster: Roster
  /** 页内操作反馈统一走全局底部提示 */
  onNotify: (text: string) => void
  /** 当前页签由路由决定（#/settings/roster | #/settings/profile），组件本身不持状态 */
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onSaveMembers: (members: Member[], groups?: MemberGroup[]) => void
  /** 新建或改名分组（即时生效） */
  onSaveGroup: (group: MemberGroup) => void
  /** 删除分组：组内成员变未分组，不删人 */
  onRemoveGroup: (groupId: string) => void
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
  onNotify,
  tab,
  onTabChange,
  onSaveMembers,
  onSaveGroup,
  onRemoveGroup,
  onSaveSelf,
  onSaveSalary,
  onSavePattern,
  onRemovePattern,
  onBackup,
  onRestore,
  onClearAll,
  onStartWizard
}: SettingsScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  /** Excel 批量导入：选文件 → 解析 → 追加 → 直接落盘（与排序「完成」同一套） */
  const importRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<MemberRow[]>(() => orderByGroup(toRows(roster.members), roster.groups))
  const [dirty, setDirty] = useState(false)
  /** null = 全部；UNGROUPED_MEMBERS = 未分组；其余是分组 id */
  const [activeTab, setActiveTab] = useState<string | null>(null)
  /** 「分组管理」折叠区：改名/删除，收起时只留 tab */
  const [managingGroups, setManagingGroups] = useState(false)
  /**
   * 删分组会连带把已保存成员的 groupId 清掉，`roster.members` 因此换引用。
   * 这一轮同步要跳过 —— 否则下面那个「外部数据变了就重置草稿」的 effect
   * 会把用户还没保存的姓名/班序改动一起丢掉。
   */
  const skipMemberSync = useRef(false)
  /** 排序模式：卡片压成紧凑行，只有把手能拖；「完成」直接落盘，「取消」回滚快照 */
  const [sorting, setSorting] = useState(false)
  const sortSnapshot = useRef<MemberRow[] | null>(null)
  const dirtyBeforeSort = useRef(false)
  const [confirmText, setConfirmText] = useState('')
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
   * 同一个页面内切 tab 时容器会被 React 复用，滚动位置会留着 ——
   * 从人员配置滚到一半切到个人资料，就会停在中间，所以切页统一回顶。
   * 但首次挂载（例如从别的页面切回设置）不能回顶：App 会恢复上次的位置。
   */
  const flowRef = useRef<HTMLDivElement>(null)
  const lastTab = useRef(tab)

  useEffect(() => {
    if (lastTab.current === tab) return
    lastTab.current = tab
    if (flowRef.current) flowRef.current.scrollTop = 0
  }, [tab])

  useEffect(() => {
    if (skipMemberSync.current) {
      skipMemberSync.current = false
      return
    }
    setRows(orderByGroup(toRows(roster.members), roster.groups))
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

  /** 分组 id → 草稿人数：tab 上的数字要跟着未保存的改动实时变 */
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    rows.forEach(row => {
      if (row.groupId) counts[row.groupId] = (counts[row.groupId] ?? 0) + 1
    })
    return counts
  }, [rows])

  const ungroupedCount = useMemo(() => rows.filter(row => !row.groupId).length, [rows])
  const visibleRows = useMemo(() => {
    if (activeTab === null) return rows
    if (activeTab === UNGROUPED_MEMBERS) return rows.filter(row => !row.groupId)
    return rows.filter(row => row.groupId === activeTab)
  }, [activeTab, rows])
  const isGroupTab = activeTab !== null && activeTab !== UNGROUPED_MEMBERS
  /** 有分组时只有具体分组 / 未分组可排序；没建分组时「全部」就是唯一的块，也可以排 */
  const canSort = isGroupTab
    || activeTab === UNGROUPED_MEMBERS
    || (roster.groups.length === 0 && activeTab === null)
  const activeGroup = isGroupTab ? roster.groups.find(group => group.id === activeTab) : undefined

  // 分组被删、或「未分组」已经没人时，退回「全部」，不让页面停在一个不存在的 tab 上
  useEffect(() => {
    if (activeTab === null) return
    if (activeTab === UNGROUPED_MEMBERS) {
      // 分组全删光后「未分组」tab 不再出现，回到唯一的「全部」
      if (ungroupedCount === 0 || roster.groups.length === 0) {
        setActiveTab(null)
        setSorting(false)
      }
      return
    }
    if (!roster.groups.some(group => group.id === activeTab)) {
      setActiveTab(null)
      setSorting(false)
      sortSnapshot.current = null
    }
  }, [activeTab, roster.groups, ungroupedCount])

  async function chooseBackupDir() {
    try {
      const picked = await pickBackupDir(backupDir)
      if (!picked) return
      saveBackupDir(picked)
      setBackupDirState(picked)
      onNotify(`备份将保存到 ${picked}`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '选择目录失败')
    }
  }

  function resetBackupDir() {
    saveBackupDir(null)
    setBackupDirState(null)
    onNotify(`已恢复默认：导出会存到 ${downloadDir ?? '系统「下载」文件夹'}。`)
  }

  function changeCloseBehavior(next: CloseBehavior) {
    setCloseBehaviorState(next)
    saveCloseBehavior(next)
    syncCloseBehaviorToShell(next)
  }

  function update(next: MemberRow[]) {
    // 在「全部」改分组时，把这一行放到输入末尾再按分组块排序 ——
    // stable 排序会把它落在新分组块的末尾，而不是插到别人前面。
    const currentGroup = new Map(rows.map(row => [row.key, row.groupId]))
    const movedKeys = new Set(
      next
        .filter(row => currentGroup.has(row.key) && currentGroup.get(row.key) !== row.groupId)
        .map(row => row.key)
    )
    const orderedInput = movedKeys.size === 0
      ? next
      : [
        ...next.filter(row => !movedKeys.has(row.key)),
        ...next.filter(row => movedKeys.has(row.key))
      ]

    setRows(orderByGroup(orderedInput, roster.groups))
    setDirty(true)
  }

  /** 切换 tab：退出排序但保留当前顺序，不自动落盘 */
  function selectTab(next: string | null) {
    if (next === activeTab) return
    if (sorting) {
      setSorting(false)
      sortSnapshot.current = null
    }
    setActiveTab(next)
  }

  /**
   * 添加成员：落到当前 tab。
   * 追加到完整草稿末尾后由 orderByGroup 放进对应分组块的末尾，
   * 「全部 / 未分组」则落到未分组块最后。
   */
  function addMember() {
    if (sorting) return
    const nextPattern = patternOptions[rows.length % Math.max(patternOptions.length, 1)]?.id ?? '4F'
    const groupId = isGroupTab && activeTab ? activeTab : ''
    update([...rows, createRow(nextPattern, groupId)])
  }

  function enterSorting() {
    if (!canSort) {
      onNotify('排序请在具体分组里做，「全部」按分组顺序排列')
      return
    }
    if (visibleRows.length < 2) {
      onNotify('当前分组至少两位成员才能排序')
      return
    }
    sortSnapshot.current = rows.map(row => ({ ...row }))
    dirtyBeforeSort.current = dirty
    setSorting(true)
  }

  /**
   * 点「完成」即落盘。
   *
   * 排序只改成员数组顺序、不碰姓名与班序，没有校验风险 ——
   * 再要求用户回到编辑态多点一次「保存成员设置」，只是把同一个动作做两遍。
   * 只有「还有没填完的成员」时例外：那次保存会被校验拦住，此时保留草稿与吸底保存条，
   * 并说明原因，避免让人以为顺序没生效。
   */
  function finishSorting() {
    setSorting(false)
    if (errors.length === 0) {
      save()
      return
    }
    onNotify('还有未填完的成员：顺序已保留，补齐后再保存。')
  }

  function cancelSorting() {
    if (sortSnapshot.current) {
      setRows(sortSnapshot.current.map(row => ({ ...row })))
    }
    setDirty(dirtyBeforeSort.current)
    setSorting(false)
  }

  /** 取消未保存的成员改动：丢弃草稿，回到已保存的名单 */
  function discardMemberDraft() {
    setRows(orderByGroup(toRows(roster.members), roster.groups))
    setDirty(false)
  }

  function save() {
    if (errors.length > 0) return

    const keptIds = new Set(drafts.map(member => member.id))
    const removed = roster.members.filter(member => !keptIds.has(member.id))
    const removedOverrides = removed.reduce((total, member) => total + countOverrides(roster, member.id), 0)

    onSaveMembers(drafts)
    setDirty(false)
    onNotify(
      removed.length > 0
        ? `已保存：删除 ${removed.length} 位成员，连带清理 ${removedOverrides} 条改班记录。`
        : `已保存：${drafts.length} 位成员。`
    )
  }

  /**
   * 删除分组：组内成员变未分组，不删人、不删改班记录。
   *
   * 先本地清掉草稿里的 groupId，再跳过下一轮「外部数据变了就重置草稿」的同步，
   * 保证用户还没保存的其它改动不会因为删一个分组而丢。
   */
  function removeGroup(groupId: string) {
    const group = roster.groups.find(item => item.id === groupId)
    if (!group) return

    // 人数按草稿算：还没保存的成员也算在组里，提示才不会少报
    const affected = rows.filter(row => row.groupId === groupId).length
    const remainingGroups = roster.groups.filter(item => item.id !== groupId)
    if (remainingGroups.length === 0) setManagingGroups(false)

    if (activeTab === groupId) {
      setActiveTab(null)
      setSorting(false)
      sortSnapshot.current = null
    }

    skipMemberSync.current = true
    setRows(current => orderByGroup(
      current.map(row => (row.groupId === groupId ? { ...row, groupId: '' } : row)),
      remainingGroups
    ))
    onRemoveGroup(groupId)
    onNotify(
      affected > 0
        ? `已删除分组「${group.name}」，${affected} 位成员变为未分组。`
        : `已删除分组「${group.name}」。`
    )
  }

  function createGroup(name: string) {
    const group: MemberGroup = { id: createGroupId(), name }
    onSaveGroup(group)
    // 新建立的组马上成为当前 tab，接着就能往里加人
    setActiveTab(group.id)
    setManagingGroups(false)
    onNotify(`已新建分组「${name}」。`)
  }

  /**
   * 从 Excel 批量导入成员。
   *
   * 只在成员表通过校验时执行 —— 导入即保存，草稿里还有空姓名/重名的话，
   * 会把半成品一起写进去。合并规则全在 data/memberImport：追加、重名跳过、
   * 班序认不出来退回默认，界面只负责选文件与念结果。
   */
  async function importMembers(file: File) {
    if (errors.length > 0) {
      onNotify('成员表里还有没填完的行，先补齐后再导入。')
      return
    }

    try {
      const { people, blankRows } = readMemberSheet(await file.arrayBuffer())
      if (people.length === 0) {
        onNotify('没读到成员：首行请写表头「姓名 / 分组 / 班序 / 岗位」。')
        return
      }

      const result = mergeImportedMembers(
        people,
        roster.members.map(member => member.name),
        patternOptions.map(option => ({ id: option.id, name: option.name })),
        patternOptions[0]?.id ?? '4F',
        roster.groups,
        // 在某个分组 tab 里导入时，分组列留空的人归到当前分组
        isGroupTab && activeTab ? activeTab : undefined
      )
      const preview = { ...result, blankRows }

      if (result.members.length > 0) {
        const allGroups = [...roster.groups, ...result.newGroups]
        const next = orderByGroup([...rows, ...toRows(result.members)], allGroups)
        setRows(next)
        // 新建的分组和成员同一次落盘，避免出现「人进来了、部门没建」的中间态
        onSaveMembers(fromRows(next), allGroups)
        // 批量导入可能跨多个分组，切回「全部」才能一次看到结果
        setActiveTab(null)
      }
      onNotify(describeImport(preview))
    } catch {
      onNotify('读取失败：这个文件不是有效的 Excel / CSV。')
    }
  }

  const memberEmptyText = activeTab === null
    ? undefined
    : activeTab === UNGROUPED_MEMBERS
      ? '没有未分组的成员。'
      : `「${activeGroup?.name ?? '这个分组'}」还没有成员，点下面的「添加成员」加人。`

  return (
    /*
     * 设置页两个 tab 都把页头钉住：`.canvas.is-pinned` 让画布自己不滚，
     * 页头之下的内容收进 `.canvas-flow` 单独滚 —— 于是「设置 / 人员配置 / 分页切换」
     * 这条页头在翻成员表、翻备份说明时始终留在原位，分隔线就是滚动区的上边界。
     */
    <div className="canvas is-settings is-pinned">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">设置</h1>
          <p className="canvas-sub">{TAB_SUB[tab]}</p>
        </div>

        <div className="canvas-tools">
          {/*
            分页换成 shadcn Tabs：value / onValueChange 直接接路由里的 settingsTab，
            内容区仍在 Tabs 之外（`tab === 'roster' ? … : …`），所以不用 TabsContent ——
            页签只负责「显示哪一个」，切换本身还是要写进 hash。
          */}
          <Tabs value={tab} onValueChange={next => onTabChange(next as SettingsTab)}>
            <TabsList aria-label="设置分页">
              <TabsTrigger value="roster">人员配置</TabsTrigger>
              <TabsTrigger value="profile">个人资料</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="canvas-flow" ref={flowRef}>
        {tab === 'roster' ? (
          <>
            <section className="settings-section">
              <div className="settings-label">
                <h2>班序</h2>
              </div>

              <div className="settings-panel">
                <PatternList
                  lookup={lookup}
                  roster={roster}
                  onNotice={onNotify}
                  onRemovePattern={onRemovePattern}
                  onSavePattern={onSavePattern}
                />
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-label">
                <div className="label-head">
                  <h2>成员</h2>
                  {/* 有分组时排序只在具体分组里做；没建分组时「全部」就是唯一的块。
                      进入排序后「完成 / 取消」移到吸底条上，标题行不再重复一遍 */}
                  {canSort && !sorting ? (
                    <div className="label-actions">
                      <button className="sort-action" type="button" onClick={enterSorting}>排序</button>
                    </div>
                  ) : null}
                </div>
                <p className="settings-meta">
                  当前 {rows.length} 位成员 · {roster.groups.length} 个分组
                </p>
              </div>

              <div className="settings-panel">
                <MemberGroupTabs
                  activeTab={activeTab}
                  allCount={rows.length}
                  counts={groupCounts}
                  groups={roster.groups}
                  managing={managingGroups}
                  ungroupedCount={ungroupedCount}
                  onCreate={createGroup}
                  onNotice={onNotify}
                  onSelect={selectTab}
                  onToggleManage={() => setManagingGroups(value => !value)}
                />

                {managingGroups && roster.groups.length > 0 ? (
                  <div className="member-groups-manage">
                    <MemberGroupsEditor
                      counts={groupCounts}
                      groups={roster.groups}
                      showAdd={false}
                      onNotice={onNotify}
                      onRemoveGroup={removeGroup}
                      onSaveGroup={onSaveGroup}
                    />
                  </div>
                ) : null}

                {/* 错误已逐行标在对应成员卡上；隐藏分组的错误在吸底条里给出提示 */}
                {/* 分组列在「全部」用来调组；在「未分组」里给一个归组入口，
                    选完这行会立刻从当前列表消失（草稿仍要「保存成员设置」才落盘） */}
                <MemberRowsEditor
                  emptyText={memberEmptyText}
                  groups={roster.groups}
                  patterns={patternOptions}
                  rows={rows}
                  showGroupField={roster.groups.length > 0
                    && (activeTab === null || activeTab === UNGROUPED_MEMBERS)}
                  sorting={sorting}
                  selfId={self?.id}
                  visibleGroup={activeTab ?? undefined}
                  onAdd={addMember}
                  onChange={update}
                  onImport={() => importRef.current?.click()}
                />

                {/* 从 Excel 导入：选完文件立即解析并落盘，不再走一次「保存成员设置」 */}
                <input
                  ref={importRef}
                  accept=".xlsx,.xls,.csv"
                  className="visually-hidden"
                  name="member-import"
                  tabIndex={-1}
                  type="file"
                  onChange={event => {
                    const file = event.target.files?.[0]
                    // 清空 value：同一个文件改完再导入也要能触发 change
                    event.target.value = ''
                    if (file) void importMembers(file)
                  }}
                />

                {/* 排序态与未保存改动都用同一条吸底条：说明在左，取消 / 主操作在右 */}
                {sorting ? (
                  <div className="settings-actions is-sticky">
                    <span className="save-hint is-sort">拖拽调整顺序，完成即保存</span>
                    <div className="save-bar-actions">
                      <button className="btn btn-quiet" type="button" onClick={cancelSorting}>取消</button>
                      <button className="btn btn-primary" type="button" onClick={finishSorting}>完成</button>
                    </div>
                  </div>
                ) : dirty ? (
                  <div className="settings-actions is-sticky">
                    <span className={`save-hint${errors.length > 0 ? ' is-blocked' : ''}`}>
                      {errors.length > 0
                        ? `有 ${errors.length} 处待处理，切到对应分组查看`
                        : '有未保存的修改'}
                    </span>
                    <div className="save-bar-actions">
                      <button className="btn btn-quiet" type="button" onClick={discardMemberDraft}>取消</button>
                      <button className="btn btn-primary" disabled={errors.length > 0} type="button" onClick={save}>
                        保存成员设置
                      </button>
                    </div>
                  </div>
                ) : null}

                {rows.length === 0 ? (
                  <div className="settings-actions">
                    <button className="btn" type="button" onClick={onStartWizard}>用向导重新配置</button>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <>
            <ProfileSection
              patterns={patternOptions}
              roster={roster}
              onNotice={onNotify}
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
                  只在桌面壳里提示：数据存于 WebView2 自己的用户目录
                  （%LOCALAPPDATA%\<bundle id>\EBWebView），卸载 / 重装 /
                  清理应用数据会连它一起清掉，所以要提醒先导出。
                */}
                {isTauriShell() ? (
                  <p>
                    数据只保存在电脑本地，不联网、不上传。
                    <br />
                    卸载、重装或清理应用数据前，请先导出备份。
                  </p>
                ) : null}
                <p className="settings-meta">
                  当前 {roster.members.length} 位成员 · {roster.overrides.length} 条改班记录
                </p>
              </div>

              <div className="settings-panel">
                <div className="settings-actions">
                  <button className="btn" type="button" onClick={onBackup}>导出备份</button>
                  <button className="btn" type="button" onClick={() => fileRef.current?.click()}>导入备份</button>
                  <input
                    ref={fileRef}
                    accept="application/json,.json"
                    className="visually-hidden"
                    name="backup-file"
                    tabIndex={-1}
                    type="file"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) onRestore(file)
                      event.target.value = ''
                    }}
                  />
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

              </div>
            </section>

            <section className="settings-section">
              <div className="settings-label">
                <h2>清空数据</h2>
              </div>

              <div className="settings-panel">
                <div className="danger-row">
                  <Input
                    aria-label="输入清空以确认"
                    autoComplete="off"
                    className="max-w-[220px] max-lg:max-w-none max-lg:flex-1 max-lg:basis-[140px]"
                    name="clear-confirm"
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
