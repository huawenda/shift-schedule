import { Button } from '@/components/ui/button'

import type { JigPrefs } from '../core/config'

interface JigSettingsSectionProps {
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
}

/**
 * 设置页 JIG DATA 页签的「一般」组：目录、行高与两个开关。
 *
 * 原来是一个独立弹层（JIG 顶栏的齿轮），现在并进设置页 —— 它本来就是
 * 「本机偏好」，跟界面、备份属于同一类东西，散在页面里反而更不好找。
 *
 * **改动即时生效**，没有保存 / 取消：五项都是开关与档位，改一下立刻能看出
 * 结果（行高直接作用在表格上），再点一次保存只是多一次点击。
 *
 * 这一屏全是**本机偏好**，不进备份文件：换个机器就该按新机器的情况重设，
 * 把旧机器的路径搬过去只会指向一个不存在的目录。
 */
export function JigSettingsSection({
  prefs,
  sourceDir,
  exportDir,
  canPickDir,
  onPickDir,
  onSave
}: JigSettingsSectionProps) {
  /** 改一项就落一次盘：写的是 localStorage，开销可忽略，父级 state 跟着更新 */
  const apply = (
    patch: Partial<JigPrefs>,
    dirs?: { sourceDir?: string | null; exportDir?: string | null }
  ) => {
    onSave(
      { ...prefs, ...patch },
      {
        sourceDir: dirs && 'sourceDir' in dirs ? dirs.sourceDir ?? null : sourceDir,
        exportDir: dirs && 'exportDir' in dirs ? dirs.exportDir ?? null : exportDir
      }
    )
  }

  const pickDir = async (which: 'sourceDir' | 'exportDir') => {
    const current = which === 'sourceDir' ? sourceDir : exportDir
    const picked = await onPickDir(current)
    if (picked) apply({}, { [which]: picked })
  }

  return (
    <section className="settings-group">
      <div className="settings-label">
        <h2>一般</h2>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-label">
            <span>源文件目录</span>
            <span className="settings-row-hint">打开 MES 导出的 Excel 时的起始位置</span>
          </div>
          <div className="settings-row-control">
            <span
              className={`settings-path${sourceDir ? '' : ' is-default'}`}
              title={sourceDir ?? '未设置'}
            >
              {sourceDir ?? '未设置'}
            </span>
            <Button
              disabled={!canPickDir}
              onClick={() => void pickDir('sourceDir')}
              type="button"
              variant="outline"
            >
              选择…
            </Button>
            {sourceDir ? (
              <Button onClick={() => apply({}, { sourceDir: null })} type="button" variant="ghost">
                清除
              </Button>
            ) : null}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span>导出目录</span>
            <span className="settings-row-hint">导出 Excel 时的默认位置</span>
          </div>
          <div className="settings-row-control">
            <span
              className={`settings-path${exportDir ? '' : ' is-default'}`}
              title={exportDir ?? '未设置'}
            >
              {exportDir ?? '未设置'}
            </span>
            <Button
              disabled={!canPickDir}
              onClick={() => void pickDir('exportDir')}
              type="button"
              variant="outline"
            >
              选择…
            </Button>
            {exportDir ? (
              <Button onClick={() => apply({}, { exportDir: null })} type="button" variant="ghost">
                清除
              </Button>
            ) : null}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span>表格行高</span>
            <span className="settings-row-hint">四个页签的表格同时生效</span>
          </div>
          <div className="settings-row-control">
            <div className="segmented" role="group" aria-label="表格行高">
              {[24, 28, 32].map(value => (
                <button
                  aria-pressed={prefs.rowHeight === value}
                  className={`segmented-item${prefs.rowHeight === value ? ' is-on' : ''}`}
                  key={value}
                  type="button"
                  onClick={() => apply({ rowHeight: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span>粘贴时自动提取 ID</span>
            <span className="settings-row-hint">从剪贴板内容里挑出 JIG ID，忽略其它文字</span>
          </div>
          <div className="settings-row-control">
            <div className="segmented" role="group" aria-label="粘贴时自动提取 ID">
              <button
                aria-pressed={prefs.clipboardAutoProcessEnabled}
                className={`segmented-item${prefs.clipboardAutoProcessEnabled ? ' is-on' : ''}`}
                type="button"
                onClick={() => apply({ clipboardAutoProcessEnabled: true })}
              >
                开
              </button>
              <button
                aria-pressed={!prefs.clipboardAutoProcessEnabled}
                className={`segmented-item${!prefs.clipboardAutoProcessEnabled ? ' is-on' : ''}`}
                type="button"
                onClick={() => apply({ clipboardAutoProcessEnabled: false })}
              >
                关
              </button>
            </div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span>导出文件名加时间戳</span>
            <span className="settings-row-hint">同名文件不会互相覆盖</span>
          </div>
          <div className="settings-row-control">
            <div className="segmented" role="group" aria-label="导出文件名加时间戳">
              <button
                aria-pressed={prefs.exportTimestampEnabled}
                className={`segmented-item${prefs.exportTimestampEnabled ? ' is-on' : ''}`}
                type="button"
                onClick={() => apply({ exportTimestampEnabled: true })}
              >
                开
              </button>
              <button
                aria-pressed={!prefs.exportTimestampEnabled}
                className={`segmented-item${!prefs.exportTimestampEnabled ? ' is-on' : ''}`}
                type="button"
                onClick={() => apply({ exportTimestampEnabled: false })}
              >
                关
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
