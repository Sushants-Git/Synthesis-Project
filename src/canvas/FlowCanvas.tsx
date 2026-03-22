import { Tldraw, type Editor, type TLShapeId } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import FloatingPrompt from '../components/FloatingPrompt.tsx'
import FlowExecutor from '../components/FlowExecutor.tsx'
import { parseIntent, type FlowSpec } from '../ai/flowParser.ts'
import { renderFlowIntoFrame, renderFlowAtPoint } from './renderFlow.ts'

interface PromptState {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  frameId?: TLShapeId
  pageX?: number
  pageY?: number
}

// Maps frameId → FlowSpec so we can execute/modify later
const flowSpecMap = new Map<string, FlowSpec>()
// Tracks which frames were created by us
const flowFrameIds = new Set<string>()

export default function FlowCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFlowFrame, setSelectedFlowFrame] = useState<{
    frameId: TLShapeId
    screenX: number
    screenY: number
  } | null>(null)
  const [executingFlow, setExecutingFlow] = useState<FlowSpec | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    editor.store.listen((entry) => {
      // Detect new frames drawn by user (Frame tool / F key)
      if (entry.source === 'user') {
        for (const record of Object.values(entry.changes.added)) {
          if (
            record.typeName === 'shape' &&
            (record as { type: string }).type === 'frame'
          ) {
            const id = (record as { id: TLShapeId }).id
            const bounds = editor.getShapePageBounds(id)
            if (!bounds) continue
            flowFrameIds.add(id)
            const center = editor.pageToScreen({
              x: bounds.x + bounds.w / 2,
              y: bounds.y + bounds.h / 2,
            })
            setPromptState({
              screenX: center.x,
              screenY: center.y,
              mode: 'create',
              frameId: id,
            })
          }
        }
      }

      // Track selection to show Modify/Execute buttons
      const selected = editor.getSelectedShapes()
      const frame = selected.find(
        (s) => s.type === 'frame' && flowFrameIds.has(s.id),
      )
      if (frame) {
        const bounds = editor.getShapePageBounds(frame.id)
        if (bounds) {
          const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y })
          setSelectedFlowFrame({
            frameId: frame.id,
            screenX: topLeft.x,
            screenY: topLeft.y - 44,
          })
          return
        }
      }
      setSelectedFlowFrame(null)
    })
  }, [])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current
      if (!editor || promptState) return

      const pagePos = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const shapesAtPoint = editor.getShapesAtPoint(pagePos)
      if (shapesAtPoint.length > 0) return

      setPromptState({
        screenX: e.clientX,
        screenY: e.clientY,
        mode: 'create',
        pageX: pagePos.x,
        pageY: pagePos.y,
      })
    },
    [promptState],
  )

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    },
    [promptState],
  )

  const openModify = useCallback(() => {
    if (!selectedFlowFrame || !editorRef.current) return
    const bounds = editorRef.current.getShapePageBounds(selectedFlowFrame.frameId)
    if (!bounds) return
    const center = editorRef.current.pageToScreen({
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    })
    setSelectedFlowFrame(null)
    setPromptState({
      screenX: center.x,
      screenY: center.y,
      mode: 'modify',
      frameId: selectedFlowFrame.frameId,
    })
  }, [selectedFlowFrame])

  const openExecute = useCallback(() => {
    if (!selectedFlowFrame) return
    const flow = flowSpecMap.get(selectedFlowFrame.frameId)
    if (flow) setExecutingFlow(flow)
  }, [selectedFlowFrame])

  return (
    <div className="relative w-full h-full" onDoubleClick={handleDoubleClick}>
      <Tldraw onMount={handleMount} />

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg max-w-md text-center">
          {error}
          <button className="ml-3 text-red-400 hover:text-red-200" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Floating action buttons for selected flow frame */}
      {selectedFlowFrame && !promptState && !executingFlow && (
        <div
          className="fixed z-40 flex gap-1"
          style={{
            left: Math.max(selectedFlowFrame.screenX, 8),
            top: Math.max(selectedFlowFrame.screenY, 8),
          }}
        >
          <button
            onClick={openExecute}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg transition-colors"
          >
            ⚡ Execute
          </button>
          <button
            onClick={openModify}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs font-medium rounded-lg shadow-lg transition-colors"
          >
            Modify
          </button>
        </div>
      )}

      {/* Contextual floating prompt */}
      {promptState && (
        <FloatingPrompt
          screenX={promptState.screenX}
          screenY={promptState.screenY}
          mode={promptState.mode}
          loading={loading}
          onSubmit={handleSubmit}
          onClose={() => {
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

      {/* Flow Executor panel */}
      {executingFlow && (
        <FlowExecutor
          flow={executingFlow}
          onClose={() => setExecutingFlow(null)}
        />
      )}

      {/* Hints */}
      {!promptState && !executingFlow && (
        <div className="fixed bottom-4 left-4 z-30 text-xs text-zinc-600 space-y-0.5 pointer-events-none select-none">
          <div>F → draw a frame → describe a flow</div>
          <div>Double-click empty canvas → quick flow</div>
          <div>Select a flow → ⚡ Execute or Modify</div>
        </div>
      )}

      {/* FlowTx wordmark */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none select-none">
        <span className="text-xs font-semibold text-zinc-500 tracking-widest uppercase">
          FlowTx
        </span>
      </div>
    </div>
  )
}
