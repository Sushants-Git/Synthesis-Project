import { useEffect, useRef, useState } from 'react'
import type { ConversationMessage, FlowSpec } from '../ai/flowParser.ts'
import { getPluginList, type Plugin } from '../plugins/registry.ts'
import PluginIcon from './PluginIcon.tsx'

type Tab = 'chat' | 'json'

function MessageBubble({ m }: { m: ConversationMessage }) {
  const [expanded, setExpanded] = useState(false)

  let flow: FlowSpec | null = null
  if (m.role === 'assistant') {
    try {
      const parsed = JSON.parse(m.content) as FlowSpec
      if (parsed.nodes && Array.isArray(parsed.nodes)) flow = parsed
    } catch { /* plain text */ }
  }

  if (flow) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[88%]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-left flex items-center gap-2.5 bg-zinc-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 hover:bg-zinc-200/70 transition-colors duration-100"
          >
            <div className="w-5 h-5 rounded-md bg-white flex items-center justify-center shrink-0 shadow-sm">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="6" rx="1" stroke="#94a3b8" strokeWidth="1.1"/>
                <path d="M3 7.5V9" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round"/>
                <path d="M7 7.5V9" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round"/>
                <path d="M2 9h6" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-zinc-700 truncate">{flow.title}</div>
              <div className="text-[9px] text-zinc-400 mt-0.5">{flow.nodes.length} steps · flow ready</div>
            </div>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`text-zinc-400 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}>
              <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {expanded && (
            <pre className="mt-1 text-[9px] font-mono text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(flow, null, 2)}
            </pre>
          )}
        </div>
      </div>
    )
  }

  const isUser = m.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] text-[12px] leading-relaxed rounded-2xl px-3.5 py-2.5 animate-fade-up break-words ${
        isUser
          ? 'bg-zinc-900 text-white rounded-tr-sm'
          : 'bg-zinc-100 text-zinc-700 rounded-tl-sm'
      }`}>
        {m.content.split(/(@\w+)/g).map((part, i) =>
          part.startsWith('@') ? (
            <code key={i} className={`text-[11px] font-mono rounded px-1 mx-0.5 ${isUser ? 'bg-white/20 text-blue-200' : 'bg-blue-100 text-blue-700'}`}>
              {part}
            </code>
          ) : part
        )}
      </div>
    </div>
  )
}

interface Props {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  loading: boolean
  initialValue?: string
  messages: ConversationMessage[]
  /** Pre-filled JSON string for the JSON editor (modify mode only) */
  flowJSON?: string
  onSubmit: (prompt: string) => void
  /** Called when user applies a manually-edited JSON spec */
  onApplyJSON?: (flow: FlowSpec) => void
  onClose: () => void
}

interface MentionState {
  query: string
  atIndex: number
  results: Plugin[]
  selected: number
}

export default function FloatingPrompt({
  screenX, screenY, mode, loading, initialValue = '', messages, flowJSON, onSubmit, onApplyJSON, onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(mode === 'modify' ? 'json' : 'chat')
  const [jsonValue, setJsonValue] = useState(flowJSON ?? '')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTab === 'chat') inputRef.current?.focus()
  }, [activeTab])

  useEffect(() => {
    if (flowJSON) setJsonValue(flowJSON)
  }, [flowJSON])

  const handleApplyJSON = () => {
    try {
      const parsed = JSON.parse(jsonValue) as FlowSpec
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        setJsonError('Invalid flow: must have a nodes array')
        return
      }
      if (!parsed.edges || !Array.isArray(parsed.edges)) {
        setJsonError('Invalid flow: must have an edges array')
        return
      }
      setJsonError(null)
      onApplyJSON?.(parsed)
    } catch (e) {
      setJsonError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
    setValue(before + inserted + after)
    setMention(null)
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
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      const results = getPluginList().filter(
        (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
      )
      if (results.length > 0) {
        setMention({ query, atIndex: textBefore.length - 1 - query.length, results, selected: 0 })
        return
      }
    }
    setMention(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => m && { ...m, selected: (m.selected + 1) % m.results.length }); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => m && { ...m, selected: (m.selected - 1 + m.results.length) % m.results.length }); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const p = mention.results[mention.selected]; if (p) insertMention(p); return }
      if (e.key === 'Escape') { setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) { onSubmit(value.trim()); setValue(''); setMention(null) }
    }
  }

  const hasThread = messages.length > 0
  const WIDTH = 400

  const left = Math.min(Math.max(screenX - WIDTH / 2, 16), window.innerWidth - WIDTH - 16)
  const top = Math.max(screenY - 80, 16)
  const maxHeight = window.innerHeight - top - 16

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('.floating-prompt')) onClose() }}
      />

      <div
        className="floating-prompt fixed z-50 flex flex-col animate-float-in"
        style={{ left, top, width: WIDTH, maxHeight }}
      >
        <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-2xl shadow-zinc-900/10 overflow-hidden flex flex-col min-h-0">

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-zinc-100 shrink-0">
            <div className="w-5 h-5 rounded-md bg-zinc-900 flex items-center justify-center shrink-0">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 4.5h7M4.5 1L8 4.5 4.5 8" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-zinc-700 flex-1">
              {hasThread ? 'Flow Builder' : mode === 'create' ? 'New Flow' : 'Modify Flow'}
            </span>
            {loading && (
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 mr-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                Thinking…
              </span>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-[background-color,color] duration-100 active:scale-90"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Tab bar — modify mode only */}
          {mode === 'modify' && (
            <div className="flex gap-0 px-4 border-b border-zinc-100 shrink-0">
              {(['json', 'chat'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-[10px] font-semibold py-2 mr-4 border-b-2 -mb-px transition-colors duration-100 ${
                    activeTab === tab
                      ? 'text-zinc-900 border-zinc-900'
                      : 'text-zinc-400 border-transparent hover:text-zinc-600'
                  }`}
                >
                  {tab === 'json' ? 'JSON' : 'Chat'}
                </button>
              ))}
            </div>
          )}

          {/* JSON editor — modify mode, json tab */}
          {mode === 'modify' && activeTab === 'json' && (
            <div className="flex flex-col px-3 py-3 gap-2 min-h-0" style={{ flex: '1 1 0', minHeight: 0 }}>
              <textarea
                value={jsonValue}
                onChange={(e) => { setJsonValue(e.target.value); setJsonError(null) }}
                className="flex-1 font-mono text-[11px] leading-relaxed text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-zinc-400 focus:bg-white transition-[border-color,background-color] duration-100"
                style={{ minHeight: 240 }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              {jsonError && (
                <div className="text-[10px] text-red-500 px-0.5 -mt-1">{jsonError}</div>
              )}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    try { setJsonValue(JSON.stringify(JSON.parse(jsonValue), null, 2)) } catch { /* ignore */ }
                  }}
                  className="px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors duration-100 shrink-0"
                >
                  Format
                </button>
                <button
                  onClick={handleApplyJSON}
                  className="flex-1 py-1.5 text-[11px] font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-[background-color,transform] duration-150 active:scale-[0.98]"
                >
                  Regenerate Diagram
                </button>
              </div>
            </div>
          )}

          {/* Thread */}
          {activeTab === 'chat' && hasThread && (
            <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 animate-fade-up">
                    <span className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                      ))}
                    </span>
                    <span className="text-[11px] text-zinc-400">Building your flow</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input area — chat tab only */}
          {activeTab === 'chat' && <div className="px-3 pb-3 pt-2 shrink-0">
            {/* @mention picker */}
            {mention && mention.results.length > 0 && (
              <div className="mb-2 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 border-b border-zinc-100 flex items-center gap-2">
                  <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold">Plugins</span>
                  <code className="text-[9px] text-blue-500 font-mono bg-blue-50 rounded px-1.5 py-0.5">@{mention.query}</code>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {mention.results.map((p, i) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(p) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-75 ${
                        i === mention.selected ? 'bg-blue-50' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center shrink-0">
                        <PluginIcon icon={p.icon} size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-zinc-800">{p.name}</span>
                          {p.category === 'soft' && (
                            <span className="text-[8px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 leading-4 font-medium">mine</span>
                          )}
                        </div>
                        <div className="text-[9px] text-zinc-400 truncate font-mono mt-0.5">
                          @{p.id} · {p.capabilities.map((c) => c.action).join(', ')}
                        </div>
                      </div>
                      <kbd className="text-[8px] text-zinc-300 bg-zinc-100 rounded px-1.5 py-0.5 shrink-0">↵</kbd>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`flex items-end gap-2 bg-zinc-50 border rounded-xl px-3 py-2 transition-[border-color,box-shadow] duration-150 ${
              loading
                ? 'border-zinc-200 opacity-60'
                : 'border-zinc-200 focus-within:border-zinc-400 focus-within:shadow-[0_0_0_3px_rgba(0,0,0,0.04)]'
            }`}>
              <textarea
                ref={inputRef}
                className="flex-1 bg-transparent text-[13px] text-zinc-900 placeholder-zinc-400 outline-none resize-none leading-relaxed"
                style={{ minHeight: hasThread ? 36 : 56, maxHeight: 120 }}
                placeholder={
                  hasThread
                    ? 'Reply or refine… (@mention a plugin)'
                    : mode === 'create'
                    ? 'Describe your flow… (@mention to pin a plugin)'
                    : 'Describe what to change…'
                }
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                onClick={() => { if (value.trim() && !loading) { onSubmit(value.trim()); setValue('') } }}
                disabled={!value.trim() || loading}
                className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-[transform,background-color,opacity] duration-150 active:scale-[0.9] shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 8.5V1.5M2 4.5L5 1.5L8 4.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {!hasThread && (
              <div className="flex items-center gap-3 mt-1.5 px-1">
                <span className="text-[9px] text-zinc-400">↵ Generate</span>
                <span className="text-[9px] text-zinc-300">·</span>
                <span className="text-[9px] text-zinc-400">Shift+↵ Newline</span>
                <span className="text-[9px] text-zinc-300">·</span>
                <span className="text-[9px] text-zinc-400">Esc Cancel</span>
              </div>
            )}
          </div>}
        </div>
      </div>
    </>
  )
}
