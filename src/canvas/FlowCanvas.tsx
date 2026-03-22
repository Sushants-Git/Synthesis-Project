import { Tldraw, type Editor, type TLShapeId } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import FloatingPrompt from '../components/FloatingPrompt.tsx'
import FlowExecutor from '../components/FlowExecutor.tsx'
import PluginSidebar from '../components/PluginSidebar.tsx'
import { parseIntent, type FlowSpec, type ConversationMessage } from '../ai/flowParser.ts'
import { renderFlowIntoFrame, renderFlowAtPoint } from './renderFlow.ts'
import { FlowNodeShapeUtil } from './FlowNodeShape.tsx'
import { EXAMPLE_FLOW } from './exampleFlow.ts'
import { getPlugin, loadPersistedPlugins } from '../plugins/registry.ts'

interface PromptState {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  frameId?: TLShapeId
  pageX?: number
  pageY?: number
}

interface FrameButtonPos {
  frameId: TLShapeId
  screenX: number
  screenY: number
}

const flowSpecMap = new Map<string, FlowSpec>()
const flowFrameIds = new Set<string>()

/** Find a canvas position that doesn't overlap existing flow frames. */
function findFreePosition(editor: Editor, approxW: number, approxH: number): { x: number; y: number } {
  const vp = editor.getViewportScreenBounds()
  const cx = SIDEBAR_W + (vp.w - SIDEBAR_W) / 2
  const cy = vp.h / 2
  const center = editor.screenToPage({ x: cx, y: cy })

  if (flowFrameIds.size === 0) {
    return { x: center.x - approxW / 2, y: center.y - approxH / 2 }
  }

  // Place below the bottom-most existing frame, vertically stacked with a gap
  let maxBottom = -Infinity
  let leftX = center.x - approxW / 2
  for (const id of flowFrameIds) {
    const b = editor.getShapePageBounds(id as TLShapeId)
    if (!b) continue
    if (b.y + b.h > maxBottom) {
      maxBottom = b.y + b.h
      leftX = b.x
    }
  }

  return { x: leftX, y: maxBottom + 60 }
}

const SIDEBAR_W = 224
const SHAPE_UTILS = [FlowNodeShapeUtil]

// Stable tldraw component overrides — must live outside the render function
// so tldraw never remounts when these are passed as props.
const TLDRAW_COMPONENTS_DEFAULT = {}
const TLDRAW_COMPONENTS_NO_STYLE = { StylePanel: null }

function recomputeFramePositions(editor: Editor): FrameButtonPos[] {
  const out: FrameButtonPos[] = []
  for (const id of flowFrameIds) {
    const bounds = editor.getShapePageBounds(id as TLShapeId)
    if (!bounds) continue
    const bottomLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y + bounds.h })
    out.push({ frameId: id as TLShapeId, screenX: bottomLeft.x, screenY: bottomLeft.y })
  }
  return out
}

export default function FlowCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [loading, setLoading] = useState(false)
  const [frameButtons, setFrameButtons] = useState<FrameButtonPos[]>([])
  const [executingFlow, setExecutingFlow] = useState<FlowSpec | null>(null)
  const [executingFrameId, setExecutingFrameId] = useState<TLShapeId | null>(null)
  /** Conversation history for the current floating prompt session */
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  /** Whether tldraw's StylePanel (colors/styles toolbar) is visible */
  const [showStylePanel, setShowStylePanel] = useState(true)

  const closePrompt = useCallback(() => {
    setPromptState(null)
    setConversation([])
  }, [])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    loadPersistedPlugins()

    // Clear any shapes tldraw persisted from a previous session — prevents stacking on reload
    const existing = editor.getCurrentPageShapeIds()
    if (existing.size > 0) editor.deleteShapes([...existing])
    flowFrameIds.clear()
    flowSpecMap.clear()

    const vp = editor.getViewportScreenBounds()
    const cx = SIDEBAR_W + (vp.w - SIDEBAR_W) / 2
    const cy = vp.h / 2
    const pagePos = editor.screenToPage({ x: cx, y: cy })
    const nodeCount = EXAMPLE_FLOW.nodes.length
    const approxFrameW = nodeCount * 220 + (nodeCount - 1) * 80 + 64
    const approxFrameH = 200

    const exampleId = renderFlowAtPoint(
      editor,
      EXAMPLE_FLOW,
      pagePos.x - approxFrameW / 2,
      pagePos.y - approxFrameH / 2,
    )
    flowFrameIds.add(exampleId)
    flowSpecMap.set(exampleId, EXAMPLE_FLOW)
    setFrameButtons(recomputeFramePositions(editor))

    editor.store.listen((entry) => {
      if (entry.source === 'user') {
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && (record as { type: string }).type === 'frame') {
            const id = (record as { id: TLShapeId }).id
            if (flowFrameIds.has(id)) continue
            const bounds = editor.getShapePageBounds(id)
            if (!bounds) continue
            flowFrameIds.add(id)
            const center = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
            setPromptState({ screenX: center.x, screenY: center.y, mode: 'create', frameId: id })
          }
        }
      }
      setFrameButtons(recomputeFramePositions(editor))
    })
  }, [])

  const openPromptAt = useCallback((screenX: number, screenY: number, pagePos?: { x: number; y: number }) => {
    const editor = editorRef.current
    const pos = pagePos ?? (editor ? editor.screenToPage({ x: screenX, y: screenY }) : { x: 0, y: 0 })
    setConversation([])
    setPromptState({ screenX, screenY, mode: 'create', pageX: pos.x, pageY: pos.y })
  }, [])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current
      if (!editor || promptState) return
      if (e.clientX < SIDEBAR_W) return
      const pagePos = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const shapesAtPoint = editor.getShapesAtPoint(pagePos)
      if (shapesAtPoint.length > 0) return
      openPromptAt(e.clientX, e.clientY, pagePos)
    },
    [promptState, openPromptAt],
  )

  const handleSidebarPrompt = useCallback((prompt: string) => {
    const editor = editorRef.current
    if (!editor) return
    const vp = editor.getViewportScreenBounds()
    const cx = SIDEBAR_W + (vp.w - SIDEBAR_W) / 2
    const cy = vp.h / 2
    const pagePos = editor.screenToPage({ x: cx, y: cy })
    setConversation([])
    setPromptState({ screenX: cx, screenY: cy, mode: 'create', pageX: pagePos.x, pageY: pagePos.y })
    pendingAutoPromptRef.current = prompt
  }, [])
  const pendingAutoPromptRef = useRef<string | null>(null)

  const handleSubmit = useCallback(
    async (userMessage: string) => {
      if (!editorRef.current || !promptState) return

      // Append user message to conversation
      const updatedConversation: ConversationMessage[] = [
        ...conversation,
        { role: 'user', content: userMessage },
      ]
      setConversation(updatedConversation)
      setLoading(true)

      try {
        const result = await parseIntent(updatedConversation)

        if (result.type === 'message') {
          // AI needs clarification — show its reply in the thread, keep prompt open
          setConversation([
            ...updatedConversation,
            { role: 'assistant', content: result.content },
          ])
        } else {
          // Got a valid flow — render it and close the prompt
          const editor = editorRef.current
          if (promptState.frameId) {
            renderFlowIntoFrame(editor, result.flow, promptState.frameId)
            flowFrameIds.add(promptState.frameId)
            flowSpecMap.set(promptState.frameId, result.flow)
          } else {
            // Estimate frame size so we can find a non-overlapping position
            const nodeCount = result.flow.nodes.length
            const approxW = nodeCount * 220 + (nodeCount - 1) * 80 + 64
            const approxH = 200
            const pos = findFreePosition(editor, approxW, approxH)
            const id = renderFlowAtPoint(editor, result.flow, pos.x, pos.y)
            flowFrameIds.add(id)
            flowSpecMap.set(id, result.flow)
          }
          setConversation([])
          setPromptState(null)
          setFrameButtons(recomputeFramePositions(editor))
        }
      } catch (err) {
        // Unexpected error — show inline in the thread
        setConversation([
          ...updatedConversation,
          { role: 'assistant', content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` },
        ])
      } finally {
        setLoading(false)
      }
    },
    [promptState, conversation],
  )

  const openModify = useCallback((btn: FrameButtonPos) => {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(btn.frameId)
    if (!bounds) return
    const center = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
    // Seed conversation with the current flow JSON so the AI knows what it's modifying
    const existingFlow = flowSpecMap.get(btn.frameId)
    const seed: ConversationMessage[] = existingFlow
      ? [{ role: 'assistant', content: JSON.stringify(existingFlow) }]
      : []
    setConversation(seed)
    setPromptState({ screenX: center.x, screenY: center.y, mode: 'modify', frameId: btn.frameId })
  }, [])

  const openExecute = useCallback((btn: FrameButtonPos) => {
    const flow = flowSpecMap.get(btn.frameId)
    if (flow) {
      setExecutingFlow(flow)
      setExecutingFrameId(btn.frameId)
      setShowStylePanel(false)
    }
  }, [])

  const handleModifyExecuting = useCallback(() => {
    const frameId = executingFrameId
    setExecutingFlow(null)
    setExecutingFrameId(null)
    setShowStylePanel(true)
    if (frameId) openModify({ frameId, screenX: 0, screenY: 0 })
  }, [executingFrameId, openModify])

  const handleAddBlock = useCallback((pluginId: string, action: string) => {
    const editor = editorRef.current
    if (!editor) return
    const plugin = getPlugin(pluginId)
    const cap = plugin?.capabilities.find((c) => c.action === action)

    // Build a minimal 2-node FlowSpec: the chosen block → system:output
    const flow: FlowSpec = {
      title: cap?.label ?? action,
      description: cap?.description ?? '',
      nodes: [
        {
          id: 'n1',
          plugin: pluginId,
          action,
          label: cap?.label ?? action,
          description: cap?.description ?? '',
          params: {},
        },
        {
          id: 'n2',
          plugin: 'system',
          action: 'output',
          label: 'Output',
          description: 'Show result',
          params: {},
        },
      ],
      edges: [{ from: 'n1', to: 'n2', label: cap?.outputs?.[0]?.key ?? 'result' }],
    }

    const approxW = 2 * 220 + 80 + 64
    const approxH = 200
    const { x, y } = findFreePosition(editor, approxW, approxH)
    const frameId = renderFlowAtPoint(editor, flow, x, y)
    flowFrameIds.add(frameId)
    flowSpecMap.set(frameId, flow)
    setFrameButtons(recomputeFramePositions(editor))
  }, [])

  return (
    <div className="flex w-full h-full">
      <PluginSidebar onPrompt={handleSidebarPrompt} onAddBlock={handleAddBlock} />

      <div
        className="relative flex-1 h-full"
        style={{ marginLeft: SIDEBAR_W }}
        onDoubleClick={handleDoubleClick}
      >
        <Tldraw
          onMount={handleMount}
          shapeUtils={SHAPE_UTILS}
          components={showStylePanel ? TLDRAW_COMPONENTS_DEFAULT : TLDRAW_COMPONENTS_NO_STYLE}
        />

        {/* Toggle tldraw style panel — only when executor is closed */}
        {!executingFlow && (
          <button
            onClick={() => setShowStylePanel((v) => !v)}
            title={showStylePanel ? 'Hide tldraw panel' : 'Show tldraw panel'}
            className="fixed top-3 right-3 z-40 px-2 py-1 bg-white border border-zinc-200 rounded-md shadow-sm text-[10px] text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 transition-colors duration-150 select-none"
          >
            {showStylePanel ? 'Hide panel' : 'Show panel'}
          </button>
        )}

        {/* Persistent Execute / Modify buttons */}
        {!promptState && frameButtons.map((btn) => {
          const executorW = executingFlow ? 400 : 0
          const maxRight = window.innerWidth - executorW - 8
          const rawLeft = Math.max(btn.screenX, SIDEBAR_W + 8)
          const left = Math.min(rawLeft, maxRight - 180)
          const isActive = executingFrameId === btn.frameId
          return (
            <div
              key={btn.frameId}
              className="fixed z-40 flex gap-1 animate-fade-up"
              style={{ left, top: btn.screenY + 8 }}
            >
              <button
                onClick={() => openExecute(btn)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg shadow-sm transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.96] ${
                  isActive
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/20'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-zinc-900/20'
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><polygon points="1.5,0.5 8.5,4.5 1.5,8.5" fill="currentColor"/></svg>
                Execute
              </button>
              <button
                onClick={() => openModify(btn)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-white/90 hover:bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-600 hover:text-zinc-900 shadow-sm backdrop-blur-sm transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.96]"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 8L6.5 1.5L8 3L2.5 8.5L1 8Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.5 2.5L7 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                Modify
              </button>
            </div>
          )
        })}

        {/* Floating prompt with conversation thread */}
        {promptState && (
          <FloatingPrompt
            screenX={promptState.screenX}
            screenY={promptState.screenY}
            mode={promptState.mode}
            loading={loading}
            messages={conversation}
            initialValue={pendingAutoPromptRef.current ?? ''}
            onSubmit={(prompt) => {
              pendingAutoPromptRef.current = null
              void handleSubmit(prompt)
            }}
            onClose={() => {
              pendingAutoPromptRef.current = null
              const editor = editorRef.current
              if (editor && promptState.frameId && !loading) {
                const children = editor.getSortedChildIdsForParent(promptState.frameId)
                if (children.length === 0) {
                  editor.deleteShapes([promptState.frameId])
                  flowFrameIds.delete(promptState.frameId)
                }
              }
              closePrompt()
            }}
          />
        )}

        {/* Flow executor */}
        {executingFlow && (
          <FlowExecutor
            flow={executingFlow}
            onClose={() => {
              setExecutingFlow(null)
              setExecutingFrameId(null)
              setShowStylePanel(true)
            }}
            onModify={handleModifyExecuting}
          />
        )}

        {/* Canvas hints */}
        {!promptState && !executingFlow && (
          <div className="fixed bottom-4 right-4 z-30 text-xs text-zinc-400 text-right space-y-0.5 pointer-events-none select-none">
            <div>F → draw frame → describe flow</div>
            <div>double-click canvas → quick prompt</div>
          </div>
        )}
      </div>
    </div>
  )
}
