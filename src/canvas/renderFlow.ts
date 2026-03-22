import { createShapeId, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import { getPlugin } from '../plugins/registry.ts'
import { PLUGIN_CSS_COLORS } from './FlowNodeShape.tsx'

const NODE_W = 200
const H_GAP = 80
const V_PADDING = 28
const H_PADDING = 32

/** Height of a node card depending on how many params it has */
function nodeHeight(node: FlowNode): number {
  const paramCount = Object.values(node.params ?? {}).filter(Boolean).length
  const base = 82
  return paramCount > 0 ? base + Math.min(paramCount, 3) * 18 : base
}

function resolveAccentColor(node: FlowNode): string {
  const plugin = getPlugin(node.plugin)
  if (!plugin) return PLUGIN_CSS_COLORS['grey']!
  return PLUGIN_CSS_COLORS[plugin.color] ?? '#6b7280'
}

export function renderFlowIntoFrame(editor: Editor, flow: FlowSpec, frameId: TLShapeId) {
  const frame = editor.getShape(frameId)
  if (!frame) return

  // Clear existing children
  const children = editor.getSortedChildIdsForParent(frameId)
  if (children.length > 0) editor.deleteShapes(children)

  const nodeCount = flow.nodes.length
  const maxH = Math.max(...flow.nodes.map(nodeHeight))
  const totalW = nodeCount * NODE_W + (nodeCount - 1) * H_GAP + H_PADDING * 2
  const totalH = maxH + V_PADDING * 2

  editor.updateShape({
    id: frameId,
    type: 'frame',
    props: { w: totalW, h: totalH, name: flow.title },
  })

  // Track per-node positions (relative to frame) for arrow routing
  const posMap: Record<string, { x: number; y: number; h: number }> = {}

  flow.nodes.forEach((node, i) => {
    const h = nodeHeight(node)
    const x = H_PADDING + i * (NODE_W + H_GAP)
    // Vertically centre nodes within the frame
    const y = V_PADDING + (maxH - h) / 2
    posMap[node.id] = { x, y, h }

    const plugin = getPlugin(node.plugin)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.createShape<any>({
      id: createShapeId(`${frameId}-${node.id}`),
      type: 'flow-node',
      parentId: frameId,
      x,
      y,
      props: {
        w: NODE_W,
        h,
        plugin: node.plugin,
        pluginName: plugin?.name ?? 'System',
        action: node.action,
        label: node.label,
        description: node.description,
        params: node.params ?? {},
        icon: plugin?.icon ?? '▸',
        accentColor: resolveAccentColor(node),
      },
    })
  })

  // Draw arrows between nodes
  flow.edges.forEach((edge) => {
    const from = posMap[edge.from]
    const to = posMap[edge.to]
    if (!from || !to) return

    const sx = from.x + NODE_W
    const sy = from.y + from.h / 2
    const ex = to.x
    const ey = to.y + to.h / 2

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
