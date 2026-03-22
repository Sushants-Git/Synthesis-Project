import { createShapeId, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { FlowSpec, NodeType } from '../ai/flowParser.ts'

const NODE_W = 180
const NODE_H = 68
const H_GAP = 90
const PADDING = 32
const HEADER_H = 36 // tldraw frame header

function nodeColor(type: NodeType): string {
  const map: Record<NodeType, string> = {
    wallet: 'blue',
    api_call: 'violet',
    approval_gate: 'orange',
    action: 'green',
    output: 'light-blue',
    filter: 'red',
  }
  return map[type] ?? 'grey'
}

/**
 * Renders a FlowSpec into an existing tldraw Frame.
 * Clears any existing children, resizes the frame to fit the flow,
 * then places nodes + arrows inside it.
 */
export function renderFlowIntoFrame(
  editor: Editor,
  flow: FlowSpec,
  frameId: TLShapeId,
) {
  const frame = editor.getShape(frameId)
  if (!frame) return

  // Clear existing children
  const children = editor.getSortedChildIdsForParent(frameId)
  if (children.length > 0) editor.deleteShapes(children)

  const nodeCount = flow.nodes.length
  const totalW = nodeCount * NODE_W + (nodeCount - 1) * H_GAP + PADDING * 2
  const totalH = NODE_H + PADDING * 2 + HEADER_H

  // Resize frame to fit content
  editor.updateShape({
    id: frameId,
    type: 'frame',
    props: { w: totalW, h: totalH, name: flow.title },
  })

  // Build id map and position map
  const idMap: Record<string, TLShapeId> = {}
  const posMap: Record<string, { x: number; y: number }> = {}

  flow.nodes.forEach((node, i) => {
    const id = createShapeId()
    idMap[node.id] = id
    const x = PADDING + i * (NODE_W + H_GAP)
    const y = PADDING
    posMap[node.id] = { x, y }

    const isDiamond = node.type === 'approval_gate'
    editor.createShape({
      id,
      type: 'geo',
      parentId: frameId,
      x,
      y,
      props: {
        geo: isDiamond ? 'diamond' : 'rectangle',
        w: NODE_W,
        h: isDiamond ? NODE_H * 1.25 : NODE_H,
        text: node.label,
        fill: 'solid',
        color: nodeColor(node.type),
        size: 's',
        font: 'sans',
        align: 'middle',
        verticalAlign: 'middle',
      },
    })
  })

  // Draw arrows between nodes
  flow.edges.forEach((edge) => {
    const fromPos = posMap[edge.from]
    const toPos = posMap[edge.to]
    if (!fromPos || !toPos) return

    const sx = fromPos.x + NODE_W
    const sy = fromPos.y + NODE_H / 2
    const ex = toPos.x
    const ey = toPos.y + NODE_H / 2

    editor.createShape({
      id: createShapeId(),
      type: 'arrow',
      parentId: frameId,
      x: sx,
      y: sy,
      props: {
        start: { x: 0, y: 0 },
        end: { x: ex - sx, y: ey - sy },
        color: 'grey',
        size: 's',
        text: edge.label ?? '',
      },
    })
  })

  // Zoom to the frame
  editor.zoomToBounds(editor.getShapePageBounds(frameId)!, {
    animation: { duration: 400 },
    inset: 60,
  })
}

/**
 * Creates a new frame at the given page position, then renders the flow into it.
 */
export function renderFlowAtPoint(
  editor: Editor,
  flow: FlowSpec,
  pageX: number,
  pageY: number,
): TLShapeId {
  const nodeCount = flow.nodes.length
  const totalW = nodeCount * NODE_W + (nodeCount - 1) * H_GAP + PADDING * 2
  const totalH = NODE_H + PADDING * 2 + HEADER_H

  const frameId = createShapeId()
  editor.createShape({
    id: frameId,
    type: 'frame',
    x: pageX,
    y: pageY,
    props: { w: totalW, h: totalH, name: flow.title },
  })

  renderFlowIntoFrame(editor, flow, frameId)
  return frameId
}
