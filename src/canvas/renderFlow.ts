import { createShapeId, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import { getPlugin } from '../plugins/registry.ts'
import { PLUGIN_CSS_COLORS, computeNodeHeight } from './FlowNodeShape.tsx'

const NODE_W = 220
const H_GAP = 80
const V_PADDING = 28
const H_PADDING = 32

function resolveAccentColor(node: FlowNode): string {
  const plugin = getPlugin(node.plugin)
  if (!plugin) return PLUGIN_CSS_COLORS['grey']!
  return PLUGIN_CSS_COLORS[plugin.color] ?? '#6b7280'
}

/**
 * Pick the best label for an arrow edge.
 * Uses the first output key of the from-node that the to-node actually needs.
 * Falls back to the first output key, then to edge.label.
 */
function edgeLabel(flow: FlowSpec, fromId: string, toId: string, fallback: string): string {
  const fromNode = flow.nodes.find((n) => n.id === fromId)
  const toNode = flow.nodes.find((n) => n.id === toId)

  const fromCap = fromNode ? getPlugin(fromNode.plugin)?.capabilities.find((c) => c.action === fromNode.action) : null
  const toCap = toNode ? getPlugin(toNode.plugin)?.capabilities.find((c) => c.action === toNode.action) : null

  const fromOutputs = fromCap?.outputs ?? []
  const toInputKeys = new Set([
    ...(toCap?.params.map((p) => p.key) ?? []),
    ...(toNode?.requiredInputs?.map((r) => r.key) ?? []),
  ])

  // Prefer a key that is both an output of `from` and an input of `to`
  const matched = fromOutputs.find((k) => toInputKeys.has(k))
  return matched ?? fromOutputs[0] ?? fallback
}

export function renderFlowIntoFrame(editor: Editor, flow: FlowSpec, frameId: TLShapeId) {
  const frame = editor.getShape(frameId)
  if (!frame) return

  // Clear existing children
  const children = editor.getSortedChildIdsForParent(frameId)
  if (children.length > 0) editor.deleteShapes(children)

  const nodeCount = flow.nodes.length
  const heights = flow.nodes.map((n) => computeNodeHeight(n.plugin, n.action))
  const maxH = Math.max(...heights)
  const totalW = nodeCount * NODE_W + (nodeCount - 1) * H_GAP + H_PADDING * 2
  const totalH = maxH + V_PADDING * 2

  editor.updateShape({
    id: frameId,
    type: 'frame',
    props: { w: totalW, h: totalH, name: flow.title },
  })

  const posMap: Record<string, { x: number; y: number; h: number }> = {}

  flow.nodes.forEach((node, i) => {
    const h = heights[i]!
    const x = H_PADDING + i * (NODE_W + H_GAP)
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

  // Draw arrows with data-flow labels
  flow.edges.forEach((edge) => {
    const from = posMap[edge.from]
    const to = posMap[edge.to]
    if (!from || !to) return

    const sx = from.x + NODE_W
    const sy = from.y + from.h / 2
    const ex = to.x
    const ey = to.y + to.h / 2

    const label = edgeLabel(flow, edge.from, edge.to, edge.label ?? '')

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
        text: label,
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
