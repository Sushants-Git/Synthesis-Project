import { useEffect, useRef, useState } from 'react'
import type { ConversationMessage, FlowSpec } from '../ai/flowParser.ts'
import { getPluginList, type Plugin } from '../plugins/registry.ts'

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
    <div className={`text-xs leading-relaxed rounded-xl px-3 py-2 animate-fade-up break-words overflow-hidden ${
      m.role === 'user'
        ? 'bg-blue-50 text-blue-900 ml-6 text-right'
        : 'bg-zinc-50 border border-zinc-200 text-zinc-700 mr-6'
    }`}>
      {m.content.split(/(@\w+)/g).map((part, i) =>
        part.startsWith('@') ? (
          <code key={i} className="text-[11px] font-mono bg-blue-100 text-blue-700 rounded px-1 mx-0.5">
            {part}
          </code>
        ) : part
      )}
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

interface MentionState {
  query: string
  atIndex: number   // index of '@' in value string
  results: Plugin[]
  selected: number
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
  const [mention, setMention] = useState<MentionState | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mention) { setMention(null); return }
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, mention])

  const insertMention = (plugin: Plugin) => {
    if (!mention) return
    const before = value.slice(0, mention.atIndex)
    const after = value.slice(mention.atIndex + 1 + mention.query.length)
    const inserted = `@${plugin.id} `
    const next = before + inserted + after
    setValue(next)
    setMention(null)
    // Re-focus and move cursor after the inserted mention
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const pos = before.length + inserted.length
      el.setSelectionRange(pos, pos)
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setValue(val)

    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    // Match a bare @ or @word immediately before cursor (no spaces after @)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      const all = getPluginList()
      const results = all.filter(
        (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
      )
      if (results.length > 0) {
        setMention({
          query,
          atIndex: textBefore.length - 1 - query.length,
          results,
          selected: 0,
        })
        return
      }
    }
    setMention(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMention((m) => m && { ...m, selected: (m.selected + 1) % m.results.length })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMention((m) => m && { ...m, selected: (m.selected - 1 + m.results.length) % m.results.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const plugin = mention.results[mention.selected]
        if (plugin) insertMention(plugin)
        return
      }
      if (e.key === 'Escape') {
        setMention(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) {
        onSubmit(value.trim())
        setValue('')
        setMention(null)
      }
    }
  }

  const hasThread = messages.length > 0
  const WIDTH = 380

  const left = Math.min(Math.max(screenX - WIDTH / 2, 16), window.innerWidth - WIDTH - 16)
  const top = Math.max(screenY - 80, 16)
  const maxHeight = window.innerHeight - top - 16

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
        style={{ left, top, width: WIDTH, maxHeight }}
      >
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl shadow-zinc-200/60 overflow-hidden flex flex-col min-h-0">
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
              className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 min-h-0"
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
          <div className="px-3 pt-2 pb-3 shrink-0">
            {/* @mention picker */}
            {mention && mention.results.length > 0 && (
              <div className="mb-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 border-b border-zinc-100 flex items-center gap-1.5">
                  <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium">Plugins</span>
                  <code className="text-[9px] text-blue-500 font-mono bg-blue-50 rounded px-1">@{mention.query}</code>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {mention.results.map((p, i) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(p) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-75 ${
                        i === mention.selected ? 'bg-blue-50' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <span className="text-base shrink-0 leading-none">{p.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-zinc-800">{p.name}</span>
                          {p.category === 'soft' && (
                            <span className="text-[8px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1 leading-4">mine</span>
                          )}
                        </div>
                        <div className="text-[9px] text-zinc-400 truncate">
                          @{p.id} · {p.capabilities.map((c) => c.action).join(', ')}
                        </div>
                      </div>
                      <kbd className="text-[8px] text-zinc-300 shrink-0">↵</kbd>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              ref={inputRef}
              className={`w-full bg-zinc-50 border rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none resize-none transition-[border-color,box-shadow] duration-150 ${
                loading
                  ? 'border-blue-200 bg-blue-50/40 cursor-not-allowed'
                  : 'border-zinc-200 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
              } ${hasThread ? 'min-h-[52px]' : 'min-h-[72px]'}`}
              placeholder={
                hasThread
                  ? 'Reply or clarify… (type @ to mention a plugin)'
                  : mode === 'create'
                  ? 'Describe the flow… (type @ to use a specific plugin)'
                  : 'Describe changes… (type @ to pin a plugin)'
              }
              value={value}
              onChange={handleChange}
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
