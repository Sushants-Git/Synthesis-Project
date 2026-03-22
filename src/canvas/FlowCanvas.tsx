import { Tldraw, createShapeId, type Editor } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css' assert { type: 'css' }
import { useCallback, useRef } from 'react'
import type { FlowSpec } from '../ai/flowParser.ts'

interface Props {
  flow: FlowSpec | null
}

const NODE_WIDTH = 200
const NODE_HEIGHT = 80
const H_GAP = 120

const NODE_COLORS: Record<string, string> = {
  wallet: '#1d4ed8',
  api_call: '#7c3aed',
  approval_gate: '#b45309',
  action: '#166534',
  output: '#1e40af',
  filter: '#be185d',
}

export default function FlowCanvas({ flow }: Props) {
  const editorRef = useRef<Editor | null>(null)

  const renderFlow = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      if (!flow) return

      // Clear existing shapes
      const existing = editor.getCurrentPageShapes()
      if (existing.length > 0) {
        editor.deleteShapes(existing.map((s) => s.id))
      }

      // Layout: simple left-to-right chain
      // Build adjacency for layout ordering
      const nodePositions: Record<string, { x: number; y: number }> = {}
      let col = 0

      flow.nodes.forEach((node) => {
        nodePositions[node.id] = {
          x: col * (NODE_WIDTH + H_GAP) + 60,
          y: 200,
        }
        col++
      })

      // Draw nodes as geo shapes
      const shapeIds: Record<string, ReturnType<typeof createShapeId>> = {}

      flow.nodes.forEach((node) => {
        const id = createShapeId(node.id)
        shapeIds[node.id] = id
        const pos = nodePositions[node.id]!
        const color = NODE_COLORS[node.type] ?? '#334155'

        editor.createShape({
          id,
          type: 'geo',
          x: pos.x,
          y: pos.y,
          props: {
            geo: node.type === 'approval_gate' ? 'diamond' : 'rectangle',
            w: NODE_WIDTH,
            h: node.type === 'approval_gate' ? NODE_HEIGHT * 1.2 : NODE_HEIGHT,
            text: `${node.label}\n${node.description}`,
            fill: 'solid',
            color: 'white',
            size: 's',
            font: 'mono',
          },
          meta: { nodeType: node.type, color },
        })
      })

      // Draw edges as arrows
      flow.edges.forEach((edge, i) => {
        const fromId = shapeIds[edge.from]
        const toId = shapeIds[edge.to]
        if (!fromId || !toId) return

        editor.createShape({
          id: createShapeId(`edge-${i}`),
          type: 'arrow',
          props: {
            start: { type: 'binding', boundShapeId: fromId, normalizedAnchor: { x: 1, y: 0.5 }, isPrecise: true },
            end: { type: 'binding', boundShapeId: toId, normalizedAnchor: { x: 0, y: 0.5 }, isPrecise: true },
            text: edge.label ?? '',
            color: 'grey',
          },
        })
      })

      // Zoom to fit
      editor.zoomToFit({ animation: { duration: 400 } })
    },
    [flow],
  )

  return (
    <div className="flex-1 w-full">
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor
          renderFlow(editor)
        }}
        hideUi={false}
      />
    </div>
  )
}
