import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import { canReadClipboard, readClipboardText } from '@/platform/jigFile'

import { processClipboardContent } from '../core/clipboard'

interface JigQueryPanelProps {
  /** 是否已有源数据 —— 没有时不让查 */
  ready: boolean
  /** 粘贴时是否自动从混合文本里挑出 JIG ID（本机偏好） */
  clipboardAutoProcessEnabled: boolean
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
export function JigQueryPanel({
  ready,
  clipboardAutoProcessEnabled,
  onQuery,
  onClear,
  notify
}: JigQueryPanelProps) {
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
   * 粘贴：从系统剪贴板读文本，自己挑出 Jig ID 写进去。
   *
   * ## 为什么必须同步 preventDefault
   *
   * `preventDefault()` 只能在事件派发的**同步阶段**调用。一旦 await 过，
   * 处理函数就返回了 Promise，浏览器随即执行默认粘贴（文本先进框），
   * 之后我们再 `setText` 写一遍 —— **内容重复**。
   * 所以顺序必须是：先同步掐断默认粘贴，再 await 读剪贴板。
   *
   * ## 浏览器 / 静态版不拦
   *
   * 那里没有剪贴板插件，读不到系统剪贴板；拦了默认粘贴又写不进内容，
   * 等于「粘贴键完全没用」。所以**先同步判断能不能读**（壳里才有插件），
   * 不能读就完全不碰这个事件，让浏览器自己粘原文。
   *
   * 用「有没有插件」而不是「读没读到」来判断 —— 后者必须 await 才知道，
   * 那时已经晚了。
   */
  const onPaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // 同步判定：能不能读系统剪贴板。壳里才有插件。
      const canRead = canReadClipboard()
      if (!canRead) {
        // 浏览器里：让浏览器自己粘原文，不拦。
        return
      }

      // 同步掐断默认粘贴 —— 必须在 await 之前
      event.preventDefault()
      event.stopPropagation()

      // 同步取一份原文兜底：插件读失败时用它还原用户按下的内容。
      // 也要在 await 之前取 —— 事件对象在异步之后不该再碰。
      const raw = event.clipboardData?.getData('text/plain') ?? ''

      const clipboard = await readClipboardTextSafe()
      if (clipboard === null) {
        // 插件在但读失败（权限等）：把原文还回去，别让用户白按一次
        if (raw) {
          setText(prev => prev + raw)
        } else {
          notify('读不到系统剪贴板，请手动粘贴', 'warning')
        }
        return
      }

      // 「粘贴时自动提取」关掉时，按原文粘贴 —— 用户可能就想粘一段完整文本
      if (!clipboardAutoProcessEnabled) {
        setText(prev => prev + clipboard)
        return
      }

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
    [clipboardAutoProcessEnabled, notify]
  )

  const count = parseIds().length

  return (
    <aside className="jig-side">
      {/*
        标签行：「清空」在右侧（原项目如此）。
        它紧挨着输入框的标题 —— 清空的是这个框里的东西，
        放在输入框下方会让人以为它清的是下面的查询结果。
      */}
      <div className="jig-side-head">
        <span className="jig-side-label">输入 Jig ID</span>
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

      <div className="jig-side-foot">
        <Button
          disabled={!ready || count === 0}
          onClick={runQuery}
          type="button"
        >
          开始查询
        </Button>
        <div className="jig-side-hint">
          Ctrl+Enter 查询 · 粘贴时自动挑出 Jig ID
        </div>
      </div>
    </aside>
  )
}

/** 读系统剪贴板；拿不到时返回 null（界面据此按原文粘贴） */
async function readClipboardTextSafe(): Promise<string | null> {
  try {
    return await readClipboardText()
  } catch {
    return null
  }
}
