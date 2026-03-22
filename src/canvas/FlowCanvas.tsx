import { Tldraw, type Editor, type TLShapeId } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import FloatingPrompt from '../components/FloatingPrompt.tsx'
import { parseIntent } from '../ai/flowParser.ts'
import { renderFlowIntoFrame, renderFlowAtPoint } from './renderFlow.ts'

interface PromptState {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  /** If set: fill this existing frame. If not set: create a new frame at pagePos. */
  frameId?: TLShapeId
  pageX?: number
  pageY?: number
}

/** IDs of frames we created (so we can detect them for "Modify") */
const flowFrameIds = new Set<string>()

export default function FlowCanvas() {
  const editorRef = useRef<Editor | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modifyButton, setModifyButton] = useState<{
    frameId: TLShapeId
    screenX: number
    screenY: number
  } | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    // Detect new frames drawn by user (via the F / frame tool)
    const unsubscribe = editor.store.listen((entry) => {
      if (entry.source !== 'user') return

      // New frame added
      for (const record of Object.values(entry.changes.added)) {
        if (
          record.typeName === 'shape' &&
          (record as { type: string }).type === 'frame'
        ) {
          const id = (record as { id: TLShapeId }).id
          const bounds = editor.getShapePageBounds(id)
          if (!bounds) continue
          const center = editor.pageToScreen({
            x: bounds.x + bounds.w / 2,
            y: bounds.y + bounds.h / 2,
          })
          flowFrameIds.add(id)
          setPromptState({
            screenX: center.x,
            screenY: center.y,
            mode: 'create',
            frameId: id,
          })
        }
      }

      // Track selection changes to show/hide Modify button
      const selected = editor.getSelectedShapes()
      const frame = selected.find(
        (s) => s.type === 'frame' && flowFrameIds.has(s.id),
      )
      if (frame) {
        const bounds = editor.getShapePageBounds(frame.id)
        if (bounds) {
          const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y })
          setModifyButton({
            frameId: frame.id,
            screenX: topLeft.x,
            screenY: topLeft.y - 44,
          })
        }
      } else {
        setModifyButton(null)
      }
    })

    return () => unsubscribe()
  }, [])

  /** Double-click on empty canvas space → show prompt at cursor */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const editor = editorRef.current
      if (!editor || promptState?.mode) return

      const pagePos = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const shapesAtPoint = editor.getShapesAtPoint(pagePos)
      if (shapesAtPoint.length > 0) return // clicking on a shape, let tldraw handle it

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
          // Fill existing frame
          renderFlowIntoFrame(editor, flow, promptState.frameId)
          flowFrameIds.add(promptState.frameId)
        } else if (promptState.pageX !== undefined && promptState.pageY !== undefined) {
          // Create new frame at click position
          const id = renderFlowAtPoint(editor, flow, promptState.pageX, promptState.pageY)
          flowFrameIds.add(id)
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
    if (!modifyButton || !editorRef.current) return
    const bounds = editorRef.current.getShapePageBounds(modifyButton.frameId)
    if (!bounds) return
    const center = editorRef.current.pageToScreen({
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    })
    setModifyButton(null)
    setPromptState({
      screenX: center.x,
      screenY: center.y,
      mode: 'modify',
      frameId: modifyButton.frameId,
    })
  }, [modifyButton])

  return (
    <div className="relative w-full h-full" onDoubleClick={handleDoubleClick}>
      <Tldraw onMount={handleMount} />

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg max-w-md text-center">
          {error}
          <button
            className="ml-3 text-red-400 hover:text-red-200"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* "Modify Flow" button that appears when a flow frame is selected */}
      {modifyButton && !promptState && (
        <button
          className="fixed z-40 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs font-medium rounded-lg shadow-lg transition-colors"
          style={{ left: modifyButton.screenX, top: Math.max(modifyButton.screenY, 8) }}
          onClick={openModify}
        >
          Modify Flow
        </button>
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
            // If we opened for a brand-new empty frame, delete it
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

      {/* Hints overlay (bottom-left) */}
      {!promptState && (
        <div className="fixed bottom-4 left-4 z-30 text-xs text-zinc-600 space-y-0.5 pointer-events-none select-none">
          <div>F → draw a frame to place a flow</div>
          <div>Double-click empty canvas → quick flow</div>
          <div>Select a flow frame → Modify</div>
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
