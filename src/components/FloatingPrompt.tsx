import { useEffect, useRef, useState } from 'react'
import type { ConversationMessage, FlowSpec } from '../ai/flowParser.ts'

/** Render a message bubble — collapses raw FlowSpec JSON into a summary pill. */
function MessageBubble({ m }: { m: ConversationMessage }) {
  const [expanded, setExpanded] = useState(false)

  // Detect seeded flow JSON (assistant messages that are valid FlowSpec)
  let flow: FlowSpec | null = null
  if (m.role === 'assistant') {
    try {
      const parsed = JSON.parse(m.content) as FlowSpec
      if (parsed.nodes && Array.isArray(parsed.nodes)) flow = parsed
    } catch { /* plain text */ }
  }

  if (flow) {
    return (
      <div className="mr-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 hover:bg-zinc-100 transition-colors duration-100"
        >
          <span className="text-sm">📋</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-700 truncate">{flow.title}</div>
            <div className="text-[10px] text-zinc-400">{flow.nodes.length} steps · current flow context</div>
          </div>
          <span className="text-[10px] text-zinc-400 shrink-0">{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <pre className="mt-1 text-[9px] font-mono text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 overflow-x-auto max-h-40 overflow-y-auto">
            {JSON.stringify(flow, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div className={`text-xs leading-relaxed rounded-xl px-3 py-2 animate-fade-up ${
      m.role === 'user'
        ? 'bg-blue-50 text-blue-900 ml-6 text-right'
        : 'bg-zinc-50 border border-zinc-200 text-zinc-700 mr-6'
    }`}>
      {m.content}
    </div>
  )
}

interface Props {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  loading: boolean
  initialValue?: string
  /** Conversation history — shown as a thread above the input */
  messages: ConversationMessage[]
  onSubmit: (prompt: string) => void
  onClose: () => void
}

export default function FloatingPrompt({
  screenX,
  screenY,
  mode,
  loading,
  initialValue = '',
  messages,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll thread to bottom whenever messages change
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) {
        onSubmit(value.trim())
        setValue('')
      }
    }
  }

  const hasThread = messages.length > 0
  const WIDTH = 380

  const left = Math.min(screenX - WIDTH / 2, window.innerWidth - WIDTH - 16)
  const top = Math.max(screenY - 80, 16)

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest('.floating-prompt')) onClose()
        }}
      />

      <div
        className="floating-prompt fixed z-50 flex flex-col gap-2 animate-float-in"
        style={{ left, top, width: WIDTH }}
      >
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl shadow-zinc-200/60 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {hasThread ? 'Flow Builder' : mode === 'create' ? 'New Flow' : 'Modify Flow'}
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 text-sm leading-none transition-colors active:scale-[0.9]"
            >
              ✕
            </button>
          </div>

          {/* Conversation thread */}
          {hasThread && (
            <div
              ref={threadRef}
              className="max-h-52 overflow-y-auto px-3 pb-2 space-y-2"
            >
              {messages.map((m, i) => (
                <MessageBubble key={i} m={m} />
              ))}

              {/* Loading indicator inline in thread */}
              {loading && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 mr-6 flex items-center gap-2 animate-fade-up">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin shrink-0" />
                  <span className="text-xs text-zinc-400">Building your flow…</span>
                </div>
              )}
            </div>
          )}

          {/* Divider if thread exists */}
          {hasThread && <div className="border-t border-zinc-100 mx-3" />}

          {/* Input area */}
          <div className="px-3 pt-2 pb-3">
            <textarea
              ref={inputRef}
              className={`w-full bg-zinc-50 border rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none resize-none transition-[border-color,box-shadow] duration-150 ${
                loading
                  ? 'border-blue-200 bg-blue-50/40 cursor-not-allowed'
                  : 'border-zinc-200 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
              } ${hasThread ? 'min-h-[52px]' : 'min-h-[72px]'}`}
              placeholder={
                hasThread
                  ? 'Reply or clarify…'
                  : mode === 'create'
                  ? 'Describe the transaction flow…'
                  : 'Describe changes to this flow…'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />

            <div className="flex items-center justify-between mt-2">
              {!hasThread && !loading && (
                <span className="text-xs text-zinc-400">↵ Generate · Esc Cancel</span>
              )}
              {!hasThread && loading && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  Generating…
                </span>
              )}
              {hasThread && <div className="flex-1" />}
              <button
                onClick={() => {
                  if (value.trim() && !loading) {
                    onSubmit(value.trim())
                    setValue('')
                  }
                }}
                disabled={!value.trim() || loading}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-[transform,background-color] duration-150 active:scale-[0.96]"
              >
                {hasThread ? 'Send' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* Tail */}
        <div
          className="w-2 h-2 bg-zinc-200 rotate-45 mx-auto -mt-3"
          style={{ marginLeft: WIDTH / 2 - 4 }}
        />
      </div>
    </>
  )
}
