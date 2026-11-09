import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { processClipboardContent } from '../core/clipboard'

interface JigQueryPanelProps {
  /** 是否已有源数据 —— 没有时不让查 */
  ready: boolean
  /** 执行查询 */
  onQuery: (ids: string[]) => void
  /** 清空查询结果 */
  onClear: () => void
  /** 提示条 */
  notify: (text: string, tone?: 'info' | 'warning' | 'error') => void
}

/**
 * JIG ID 输入区。
 *
 * 核心用法是「从邮件正文直接粘贴」—— 用户收到一封列出十几个 Jig ID 的邮件，
 * 全选复制粘进来，期望程序自动挑出那些 ID。这一步靠剪贴板插件读**系统剪贴板**
 * （WebView2 里 `navigator.clipboard.readText` 在 onPaste 事件中基本必被拒）。
 *
 * **高度按内容，不与表格联动** —— 表格有几百行，左栏若被拉成同样高，
 * 里面大片空白，输入框反而被压扁。这里用 `align-self: start` 独立成一块。
 */
export function JigQueryPanel({ ready, onQuery, onClear, notify }: JigQueryPanelProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /** 把输入框里的内容拆成 ID 列表 */
  const parseIds = useCallback(
    () =>
      text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
    [text]
  )

  const runQuery = useCallback(() => {
    onQuery(parseIds())
  }, [onQuery, parseIds])

  /**
   * 粘贴：先掐断浏览器默认粘贴，再自己读系统剪贴板。
   *
   * 读取是异步的，不先 preventDefault 的话会出现「原文 + 提取结果」两份内容。
   * 读不到剪贴板时退回按原文粘贴，不阻塞用户。
   *
   * **浏览器 / 静态版不能拦默认粘贴**：那里没有剪贴板插件，拦了就等于
   * 「粘贴键完全没用」。所以先探测能不能读，读得到才 preventDefault。
   */
  const onPaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboard = await readClipboardTextSafe()
      if (clipboard === null) {
        // 读不到系统剪贴板 —— 浏览器里这是常态，让浏览器自己粘原文。
        notify('当前环境读不到系统剪贴板，已按原文粘贴', 'warning')
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const processed = processClipboardContent(clipboard)
      if (processed === clipboard) {
        // 纯净的 ID 列表或没有 ID：按原文粘贴，与旧版行为一致
        setText(prev => prev + processed)
        return
      }

      const count = processed.split(/\r?\n/).filter(Boolean).length
      setText(prev => {
        const base = prev.replace(/\s*$/, '')
        return base ? `${base}\n${processed}` : processed
      })
      notify(`已从粘贴内容提取 ${count} 个 Jig ID`)
    },
    [notify]
  )

  const count = parseIds().length

  return (
    <aside className="jig-side">
      <div className="jig-side-label">
        <span>输入 Jig ID</span>
        {count > 0 ? <span className="jig-toolbar-note">{count} 个</span> : null}
      </div>

      <textarea
        aria-label="输入 Jig ID"
        className="jig-side-input"
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runQuery()
        }}
        onPaste={onPaste}
        placeholder={'在此粘贴 Jig ID，每行一个\n也支持从邮件正文直接粘贴'}
        ref={inputRef}
        value={text}
      />

      <Button disabled={!ready || count === 0} onClick={runQuery} type="button">
        开始查询
      </Button>

      <div className="jig-side-hint">
        Ctrl+Enter 查询 · 粘贴时自动挑出 Jig ID
      </div>

      <Button
        disabled={count === 0}
        onClick={() => {
          setText('')
          onClear()
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        清空
      </Button>
    </aside>
  )
}

/** 读系统剪贴板；拿不到时返回 null（界面据此按原文粘贴） */
async function readClipboardTextSafe(): Promise<string | null> {
  try {
    const { readClipboardText } = await import('@/platform/jigFile')
    return await readClipboardText()
  } catch {
    return null
  }
}
