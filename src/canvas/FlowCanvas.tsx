import { Tldraw, type Editor, type TLShapeId } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import FloatingPrompt from '../components/FloatingPrompt.tsx'
import FlowExecutor from '../components/FlowExecutor.tsx'
import PluginSidebar from '../components/PluginSidebar.tsx'
import { parseIntent, type FlowSpec } from '../ai/flowParser.ts'
import { renderFlowIntoFrame, renderFlowAtPoint } from './renderFlow.ts'
import { FlowNodeShapeUtil } from './FlowNodeShape.tsx'
import { EXAMPLE_FLOW } from './exampleFlow.ts'

interface PromptState {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  frameId?: TLShapeId
  pageX?: number
  pageY?: number
}

/** Position (screen coords) of action buttons for a flow frame */
interface FrameButtonPos {
  frameId: TLShapeId
  screenX: number
  screenY: number
}

const flowSpecMap = new Map<string, FlowSpec>()
const flowFrameIds = new Set<string>()

const SIDEBAR_W = 224
const SHAPE_UTILS = [FlowNodeShapeUtil]

/** Re-compute screen positions of all tracked flow frames */
function recomputeFramePositions(editor: Editor): FrameButtonPos[] {
  const out: FrameButtonPos[] = []
  for (const id of flowFrameIds) {
    const bounds = editor.getShapePageBounds(id as TLShapeId)
    if (!bounds) continue
    const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y })
    out.push({ frameId: id as TLShapeId, screenX: topLeft.x, screenY: topLeft.y - 44 })
  }
  return out
}

export default function FlowCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Persistent button positions — one entry per flow frame, always visible */
  const [frameButtons, setFrameButtons] = useState<FrameButtonPos[]>([])
  const [executingFlow, setExecutingFlow] = useState<FlowSpec | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    // Render example flow centred in the initial viewport
    const vp = editor.getViewportScreenBounds()
    const cx = SIDEBAR_W + (vp.w - SIDEBAR_W) / 2
    const cy = vp.h / 2
    const pagePos = editor.screenToPage({ x: cx, y: cy })
    const nodeCount = EXAMPLE_FLOW.nodes.length
    const approxFrameW = nodeCount * 200 + (nodeCount - 1) * 80 + 64
    const approxFrameH = 140

    const exampleId = renderFlowAtPoint(
      editor,
      EXAMPLE_FLOW,
      pagePos.x - approxFrameW / 2,
      pagePos.y - approxFrameH / 2,
    )
    // Register before the listener is attached so it's never mistaken for a user frame
    flowFrameIds.add(exampleId)
    flowSpecMap.set(exampleId, EXAMPLE_FLOW)

    // Initial button positions (after the example flow is on canvas)
    setFrameButtons(recomputeFramePositions(editor))

    editor.store.listen((entry) => {
      // Only open the prompt for frames the USER draws (not programmatic renders)
      if (entry.source === 'user') {
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === 'shape' && (record as { type: string }).type === 'frame') {
            const id = (record as { id: TLShapeId }).id
            // Skip frames we already know about (e.g. example flow)
            if (flowFrameIds.has(id)) continue
            const bounds = editor.getShapePageBounds(id)
            if (!bounds) continue
            flowFrameIds.add(id)
            const center = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
            setPromptState({ screenX: center.x, screenY: center.y, mode: 'create', frameId: id })
          }
        }
      }

      // Always recompute button positions (handles pan, zoom, shape moves)
      setFrameButtons(recomputeFramePositions(editor))
    })
  }, [])

  const openPromptAt = useCallback((screenX: number, screenY: number, pagePos?: { x: number; y: number }) => {
    const editor = editorRef.current
    const pos = pagePos ?? (editor ? editor.screenToPage({ x: screenX, y: screenY }) : { x: 0, y: 0 })
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
    setPromptState({ screenX: cx, screenY: cy, mode: 'create', pageX: pagePos.x, pageY: pagePos.y })
    pendingAutoPromptRef.current = prompt
  }, [])
  const pendingAutoPromptRef = useRef<string | null>(null)

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!editorRef.current || !promptState) return
      setLoading(true)
      setError(null)
      try {
        const flow = await parseIntent(prompt)
        const editor = editorRef.current
        if (promptState.frameId) {
          renderFlowIntoFrame(editor, flow, promptState.frameId)
          flowFrameIds.add(promptState.frameId)
          flowSpecMap.set(promptState.frameId, flow)
        } else if (promptState.pageX !== undefined && promptState.pageY !== undefined) {
          const id = renderFlowAtPoint(editor, flow, promptState.pageX, promptState.pageY)
          flowFrameIds.add(id)
          flowSpecMap.set(id, flow)
        }
        setPromptState(null)
        setFrameButtons(recomputeFramePositions(editor))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    },
    [promptState],
  )

  const openModify = useCallback((btn: FrameButtonPos) => {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(btn.frameId)
    if (!bounds) return
    const center = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
    setPromptState({ screenX: center.x, screenY: center.y, mode: 'modify', frameId: btn.frameId })
  }, [])

  const openExecute = useCallback((btn: FrameButtonPos) => {
    const flow = flowSpecMap.get(btn.frameId)
    if (flow) setExecutingFlow(flow)
  }, [])

  return (
    <div className="flex w-full h-full">
      <PluginSidebar onPrompt={handleSidebarPrompt} />

      <div
        className="relative flex-1 h-full"
        style={{ marginLeft: SIDEBAR_W }}
        onDoubleClick={handleDoubleClick}
      >
        <Tldraw onMount={handleMount} shapeUtils={SHAPE_UTILS} />

        {/* Error toast */}
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow-lg max-w-md text-center">
            {error}
            <button className="ml-3 text-red-400 hover:text-red-600" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Persistent Execute / Modify buttons — one set per flow frame */}
        {!promptState && !executingFlow && frameButtons.map((btn) => (
          <div
            key={btn.frameId}
            className="fixed z-40 flex gap-1.5"
            style={{
              left: Math.max(btn.screenX, SIDEBAR_W + 8),
              top: Math.max(btn.screenY, 8),
            }}
          >
            <button
              onClick={() => openExecute(btn)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg transition-colors"
            >
              ⚡ Execute
            </button>
            <button
              onClick={() => openModify(btn)}
              className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-700 text-xs font-medium rounded-lg shadow-lg transition-colors"
            >
              Modify
            </button>
          </div>
        ))}

        {/* Floating prompt */}
        {promptState && (
          <FloatingPrompt
            screenX={promptState.screenX}
            screenY={promptState.screenY}
            mode={promptState.mode}
            loading={loading}
            initialValue={pendingAutoPromptRef.current ?? ''}
            onSubmit={(prompt) => {
              pendingAutoPromptRef.current = null
              void handleSubmit(prompt)
            }}
            onClose={() => {
              pendingAutoPromptRef.current = null
              setPromptState(null)
              if (promptState.frameId && !loading) {
                const editor = editorRef.current
                if (editor) {
                  const children = editor.getSortedChildIdsForParent(promptState.frameId)
                  if (children.length === 0) {
                    editor.deleteShapes([promptState.frameId])
                    flowFrameIds.delete(promptState.frameId)
                  }
                }
              }
            }}
          />
        )}

        {/* Flow executor */}
        {executingFlow && (
          <FlowExecutor flow={executingFlow} onClose={() => setExecutingFlow(null)} />
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
