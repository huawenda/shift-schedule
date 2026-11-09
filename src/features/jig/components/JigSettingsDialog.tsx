import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

import type { JigPrefs } from '../core/config'

interface JigSettingsDialogProps {
  /** 当前的本机偏好 */
  prefs: JigPrefs
  /** 源文件默认目录（null = 没设） */
  sourceDir: string | null
  /** 导出默认目录（null = 没设） */
  exportDir: string | null
  /** 能否选目录（静态版不行） */
  canPickDir: boolean
  /** 选一个目录；取消返回 null */
  onPickDir: (current: string | null) => Promise<string | null>
  /** 保存 */
  onSave: (prefs: JigPrefs, dirs: { sourceDir: string | null; exportDir: string | null }) => void
  /** 关闭 */
  onClose: () => void
}

/**
 * JIG 页的设置。
 *
 * **独立于排班的设置页** —— 两套业务的设置项完全不同（这边是 MES 文件的
 * 目录、表格行高、粘贴开关；那边是成员名单、薪资、备份）。混在一个页面里
 * 反而谁都不好找。
 *
 * 这一屏全是**本机偏好**，不进备份文件：换个机器就该按新机器的情况重设，
 * 把旧机器的路径搬过去只会指向一个不存在的目录。
 */
export function JigSettingsDialog({
  prefs,
  sourceDir,
  exportDir,
  canPickDir,
  onPickDir,
  onSave,
  onClose
}: JigSettingsDialogProps) {
  const [draft, setDraft] = useState<JigPrefs>(prefs)
  const [dirs, setDirs] = useState<{ sourceDir: string | null; exportDir: string | null }>({
    sourceDir,
    exportDir
  })
  /** 关闭前先拦一下未保存的改动（与班次弹层同一套） */
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const dirty = useMemo(() => {
    const keys = Object.keys(prefs) as Array<keyof JigPrefs>
    return (
      keys.some(key => draft[key] !== prefs[key]) ||
      dirs.sourceDir !== sourceDir ||
      dirs.exportDir !== exportDir
    )
  }, [draft, prefs, dirs, sourceDir, exportDir])

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }

  const patch = (next: Partial<JigPrefs>) => setDraft(prev => ({ ...prev, ...next }))

  return (
    <Dialog onOpenChange={open => { if (!open) requestClose() }} open>
      <DialogContent
        className="jig-settings-dialog gap-0 p-0"
        onInteractOutside={event => {
          // 与班次弹层一致：点遮罩等同于点取消；有未保存改动时先确认
          event.preventDefault()
          requestClose()
        }}
      >
        <DialogHeader className="dialog-head">
          <DialogTitle className="dialog-title">JIG 设置</DialogTitle>
        </DialogHeader>

        <div className="jig-settings">
          {/* 源文件默认目录 */}
          <div className="jig-settings-row">
            <div className="jig-settings-label">
              <span>源文件目录</span>
            </div>
            <div className="jig-settings-control">
              <span
                className={`jig-settings-path${dirs.sourceDir ? '' : ' is-default'}`}
                title={dirs.sourceDir ?? '未设置'}
              >
                {dirs.sourceDir ?? '未设置'}
              </span>
              <Button
                disabled={!canPickDir}
                onClick={async () => {
                  const picked = await onPickDir(dirs.sourceDir)
                  if (picked) setDirs(prev => ({ ...prev, sourceDir: picked }))
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                选择…
              </Button>
              {dirs.sourceDir ? (
                <Button
                  onClick={() => setDirs(prev => ({ ...prev, sourceDir: null }))}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  清除
                </Button>
              ) : null}
            </div>
          </div>

          {/* 导出默认目录 */}
          <div className="jig-settings-row">
            <div className="jig-settings-label">
              <span>导出目录</span>
              <span className="jig-settings-hint">导出 Excel 时的默认位置</span>
            </div>
            <div className="jig-settings-control">
              <span
                className={`jig-settings-path${dirs.exportDir ? '' : ' is-default'}`}
                title={dirs.exportDir ?? '未设置'}
              >
                {dirs.exportDir ?? '未设置'}
              </span>
              <Button
                disabled={!canPickDir}
                onClick={async () => {
                  const picked = await onPickDir(dirs.exportDir)
                  if (picked) setDirs(prev => ({ ...prev, exportDir: picked }))
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                选择…
              </Button>
              {dirs.exportDir ? (
                <Button
                  onClick={() => setDirs(prev => ({ ...prev, exportDir: null }))}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  清除
                </Button>
              ) : null}
            </div>
          </div>

          {/* 表格行高 */}
          <div className="jig-settings-row">
            <div className="jig-settings-label">
              <span>表格行高</span>
            </div>
            <div className="jig-settings-control">
              <div className="segmented" role="group" aria-label="表格行高">
                {[24, 28, 32].map(value => (
                  <button
                    aria-pressed={draft.rowHeight === value}
                    className={`segmented-item${draft.rowHeight === value ? ' is-on' : ''}`}
                    key={value}
                    type="button"
                    onClick={() => patch({ rowHeight: value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 粘贴时自动提取 Jig ID */}
          <div className="jig-settings-row">
            <div className="jig-settings-label">
              <span>粘贴时自动提取 ID</span>
              <span className="jig-settings-hint">
                从粘贴板中提取 JIG ID
              </span>
            </div>
            <div className="jig-settings-control">
              <div className="segmented" role="group" aria-label="粘贴时自动提取 ID">
                <button
                  aria-pressed={draft.clipboardAutoProcessEnabled}
                  className={`segmented-item${draft.clipboardAutoProcessEnabled ? ' is-on' : ''}`}
                  type="button"
                  onClick={() => patch({ clipboardAutoProcessEnabled: true })}
                >
                  开
                </button>
                <button
                  aria-pressed={!draft.clipboardAutoProcessEnabled}
                  className={`segmented-item${!draft.clipboardAutoProcessEnabled ? ' is-on' : ''}`}
                  type="button"
                  onClick={() => patch({ clipboardAutoProcessEnabled: false })}
                >
                  关
                </button>
              </div>
            </div>
          </div>

          {/* 导出文件名加时间戳 */}
          <div className="jig-settings-row">
            <div className="jig-settings-label">
              <span>导出文件名加时间戳</span>
            </div>
            <div className="jig-settings-control">
              <div className="segmented" role="group" aria-label="导出文件名加时间戳">
                <button
                  aria-pressed={draft.exportTimestampEnabled}
                  className={`segmented-item${draft.exportTimestampEnabled ? ' is-on' : ''}`}
                  type="button"
                  onClick={() => patch({ exportTimestampEnabled: true })}
                >
                  开
                </button>
                <button
                  aria-pressed={!draft.exportTimestampEnabled}
                  className={`segmented-item${!draft.exportTimestampEnabled ? ' is-on' : ''}`}
                  type="button"
                  onClick={() => patch({ exportTimestampEnabled: false })}
                >
                  关
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0">
          {confirmDiscard ? (
            <>
              <span className="dialog-discard mr-auto">有未保存的修改</span>
              <Button
                onClick={() => setConfirmDiscard(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                继续编辑
              </Button>
              <Button onClick={onClose} size="sm" type="button" variant="destructive">
                放弃修改
              </Button>
            </>
          ) : (
            <>
              <Button onClick={requestClose} size="sm" type="button" variant="outline">
                取消
              </Button>
              <Button
                onClick={() => {
                  onSave(draft, dirs)
                  onClose()
                }}
                size="sm"
                type="button"
              >
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
