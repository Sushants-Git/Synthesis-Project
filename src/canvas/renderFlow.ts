import { createShapeId, toRichText, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { FlowSpec, FlowNode, NodeType } from '../ai/flowParser.ts'

const NODE_W = 200
const NODE_H = 80
const H_GAP = 90
const PADDING = 32
const HEADER_H = 36

const TYPE_ICON: Record<string, string> = {
  wallet: '💼',
  ens_resolve: '🔍',
  approval_gate: '🔐',
  action: '⚡',
  output: '✅',
  filter: '🔀',
  api_call: '🌐',
  twitter_search: '🐦',
}

function nodeColor(type: NodeType | string): string {
  const map: Record<string, string> = {
    wallet: 'blue',
    ens_resolve: 'violet',
    api_call: 'violet',
    approval_gate: 'orange',
    action: 'green',
    output: 'light-blue',
    filter: 'red',
    twitter_search: 'light-blue',
  }
  return map[type] ?? 'grey'
}

/** Format a node label with its key params for display on the canvas */
function nodeLabel(node: FlowNode): string {
  const icon = TYPE_ICON[node.type] ?? '▸'
  const title = `${icon} ${node.label}`

  const keyParams: string[] = []
  const params = node.params ?? {}

  if (params.amount) keyParams.push(`${params.amount} ETH`)
  if (params.to) keyParams.push(`→ ${params.to}`)
  if (params.ens_name) keyParams.push(params.ens_name)
  if (params.action && !params.amount) keyParams.push(params.action)

  return keyParams.length > 0 ? `${title}\n${keyParams.join('  ')}` : title
}

/**
 * Renders a FlowSpec into an existing tldraw Frame.
 */
export function renderFlowIntoFrame(
  editor: Editor,
  flow: FlowSpec,
  frameId: TLShapeId,
) {
  const frame = editor.getShape(frameId)
  if (!frame) return

  const children = editor.getSortedChildIdsForParent(frameId)
  if (children.length > 0) editor.deleteShapes(children)

  const nodeCount = flow.nodes.length
  const totalW = nodeCount * NODE_W + (nodeCount - 1) * H_GAP + PADDING * 2
  const totalH = NODE_H + PADDING * 2 + HEADER_H

  editor.updateShape({
    id: frameId,
    type: 'frame',
    props: { w: totalW, h: totalH, name: flow.title },
  })

  const posMap: Record<string, { x: number; y: number }> = {}

  flow.nodes.forEach((node, i) => {
    const x = PADDING + i * (NODE_W + H_GAP)
    const y = PADDING
    posMap[node.id] = { x, y }

    const isDiamond = node.type === 'approval_gate'
    editor.createShape({
      id: createShapeId(`${frameId}-${node.id}`),
      type: 'geo',
      parentId: frameId,
      x,
      y,
      props: {
        geo: isDiamond ? 'diamond' : 'rectangle',
        w: NODE_W,
        h: isDiamond ? NODE_H * 1.3 : NODE_H,
        richText: toRichText(nodeLabel(node)),
        fill: 'solid',
        color: nodeColor(node.type),
        size: 's',
        font: 'sans',
        align: 'middle',
        verticalAlign: 'middle',
      },
    })
  })

  flow.edges.forEach((edge) => {
    const fromPos = posMap[edge.from]
    const toPos = posMap[edge.to]
    if (!fromPos || !toPos) return

    const sx = fromPos.x + NODE_W
    const sy = fromPos.y + NODE_H / 2
    const ex = toPos.x
    const ey = toPos.y + NODE_H / 2

    editor.createShape({
      id: createShapeId(`${frameId}-arrow-${edge.from}-${edge.to}`),
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

  const bounds = editor.getShapePageBounds(frameId)
  if (bounds) {
    editor.zoomToBounds(bounds, { animation: { duration: 400 }, inset: 80 })
  }
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
  const frameId = createShapeId()
  editor.createShape({
    id: frameId,
    type: 'frame',
    x: pageX,
    y: pageY,
    props: { w: 600, h: 200, name: flow.title },
  })
  renderFlowIntoFrame(editor, flow, frameId)
  return frameId
}
