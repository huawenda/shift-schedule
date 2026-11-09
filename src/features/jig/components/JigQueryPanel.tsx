import { useCallback, useRef } from 'react'

import { Button } from '@/components/ui/button'

import { canReadClipboard, readClipboardText } from '@/platform/jigFile'

import { processClipboardContent, isPureJigIds } from '../core/clipboard'

interface JigQueryPanelProps {
  /** 是否已有源数据 —— 没有时不让查 */
  ready: boolean
  /** 输入框的内容（受控：提到 hook 里，外壳层要读它判断要不要跳页） */
  value: string
  /**
   * 改输入框内容。
   *
   * 支持 updater 形式（`(prev) => next`）—— 粘贴时要「在原内容后面追加」，
   * 用的是同一份旧值，不能先读再写（中间可能已经被别的操作改过）。
   */
  onValueChange: (
    next: string | ((prev: string) => string)
  ) => void
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
 * **受控**：内容提到 useJigData —— 顶栏的「加载」按钮在外壳层，
 * 要判断「输入框是不是空的」必须能读到它。
 */
export function JigQueryPanel({
  ready,
  value,
  onValueChange,
  clipboardAutoProcessEnabled,
  onQuery,
  onClear,
  notify
}: JigQueryPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /** 把输入框里的内容拆成 ID 列表 */
  const parseIds = useCallback(
    () =>
      value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
    [value]
  )

  const runQuery = useCallback(() => {
    onQuery(parseIds())
  }, [onQuery, parseIds])

  /**
   * 把一段文本插到当前光标 / 选区处。
   *
   * `block=true` 用于「一整块 ID」：与前后内容之间补换行，免得新 ID
   * 粘在已有行尾上；`block=false` 模拟原生粘贴，原样插入（含用户选中的
   * 区间会被替换）。之前一律追加到末尾，光标在中间或全选后粘贴都会出错。
   */
  const insertAtSelection = useCallback(
    (el: HTMLTextAreaElement, text: string, block: boolean) => {
      if (!el.isConnected) return

      const current = el.value
      const start = el.selectionStart ?? current.length
      const end = el.selectionEnd ?? current.length
      const body = text.replace(/\r\n?/g, '\n')

      const before = block && start > 0 && current[start - 1] !== '\n' ? '\n' : ''
      const after = block && end < current.length && current[end] !== '\n' ? '\n' : ''
      const next = current.slice(0, start) + before + body + after + current.slice(end)

      onValueChange(next)

      // 等受控值写回 DOM 再定位光标 —— 否则会被 React 的重渲染打回末尾
      const caret = start + before.length + body.length
      requestAnimationFrame(() => {
        if (!el.isConnected) return
        el.focus()
        const pos = Math.min(caret, el.value.length)
        el.setSelectionRange(pos, pos)
      })
    },
    [onValueChange]
  )

  /**
   * 粘贴：挑出 Jig ID 并插到光标处。
   *
   * `preventDefault()` 只能在事件派发的**同步阶段**调用 —— 一旦 await 过，
   * 浏览器会先执行默认粘贴，我们随后再写一遍，内容就重复了。
   * 顺序必须是「先同步掐断，再异步取文本」。
   *
   * 浏览器 / 静态版没有剪贴板能力，直接放行原生粘贴，完全不碰事件。
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

      const el = event.currentTarget
      /*
       * 事件里带的文本就是用户按下的内容，**优先用它**：
       * 读系统剪贴板是一次异步 IPC，期间剪贴板可能已被别的程序改掉；
       * 只有事件里拿不到文本时（WebView2 偶发为空）才回退去读系统剪贴板。
       */
      const raw = event.clipboardData?.getData('text/plain') ?? ''
      const clipboard = raw || (await readClipboardTextSafe()) || ''

      if (!clipboard) {
        notify('剪贴板里没有文本', 'warning')
        return
      }

      // 「粘贴时自动提取」关掉时，按原文粘贴 —— 用户可能就想粘一段完整文本
      if (!clipboardAutoProcessEnabled) {
        insertAtSelection(el, clipboard, false)
        return
      }

      const processed = processClipboardContent(clipboard)
      const extracted = processed !== clipboard
      /*
       * 纯 ID 列表同样按「块」插入：它本身是多行内容，若光标停在某行中间，
       * 原样插入会把两个 ID 粘成一行。只有「没提取出任何 ID」的混合文本
       * 才按原生粘贴处理。
       */
      insertAtSelection(el, processed, extracted || isPureJigIds(clipboard))

      if (extracted) {
        const count = processed.split(/\r?\n/).filter(Boolean).length
        notify(`已从粘贴内容提取 ${count} 个 Jig ID`)
      }
    },
    [clipboardAutoProcessEnabled, insertAtSelection, notify]
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
            onValueChange('')
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
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runQuery()
        }}
        onPaste={onPaste}
        placeholder={'在此粘贴 Jig ID，每行一个\n也支持从邮件正文直接粘贴'}
        ref={inputRef}
        value={value}
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
