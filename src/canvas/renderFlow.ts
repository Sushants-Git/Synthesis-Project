import { createShapeId, toRichText, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import { getPlugin } from '../plugins/registry.ts'

const NODE_W = 200
const NODE_H = 80
const H_GAP = 90
const PADDING = 32
const HEADER_H = 36

function pluginColor(node: FlowNode): string {
  const plugin = getPlugin(node.plugin)
  if (plugin) return plugin.color
  // fallback for system nodes
  if (node.action === 'output') return 'light-blue'
  if (node.action === 'filter') return 'red'
  return 'grey'
}

function pluginIcon(node: FlowNode): string {
  const plugin = getPlugin(node.plugin)
  return plugin?.icon ?? '▸'
}

function nodeLabel(node: FlowNode): string {
  const icon = pluginIcon(node)
  const title = `${icon} ${node.label}`
  const params = node.params ?? {}

  const highlights: string[] = []
  if (params.amount) highlights.push(`${params.amount} ETH`)
  if (params.to) highlights.push(`→ ${params.to}`)
  if (params.ens_name) highlights.push(params.ens_name)
  if (params.query) highlights.push(`"${params.query}"`)
  if (params.max_amount) highlights.push(`max ${params.max_amount} ETH`)
  if (params.credential) highlights.push(params.credential)

  return highlights.length > 0 ? `${title}\n${highlights.join('  ')}` : title
}

export function renderFlowIntoFrame(editor: Editor, flow: FlowSpec, frameId: TLShapeId) {
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

    const isApproval = node.action === 'approve' || node.action === 'user_approval'
    editor.createShape({
      id: createShapeId(`${frameId}-${node.id}`),
      type: 'geo',
      parentId: frameId,
      x,
      y,
      props: {
        geo: isApproval ? 'diamond' : 'rectangle',
        w: NODE_W,
        h: isApproval ? NODE_H * 1.3 : NODE_H,
        richText: toRichText(nodeLabel(node)),
        fill: 'solid',
        color: pluginColor(node),
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
