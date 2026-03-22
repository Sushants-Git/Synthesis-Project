import { HTMLContainer, Rectangle2d, ShapeUtil, type TLBaseShape } from '@tldraw/tldraw'
import { getPlugin } from '../plugins/registry.ts'

/** Map tldraw-style plugin color names → CSS hex accent colors */
export const PLUGIN_CSS_COLORS: Record<string, string> = {
  orange: '#f97316',
  blue:   '#6366f1',
  green:  '#22c55e',
  red:    '#ef4444',
  violet: '#a855f7',
  grey:   '#94a3b8',
  'light-blue': '#38bdf8',
  yellow: '#eab308',
  black:  '#18181b',
  white:  '#94a3b8',
}

export type FlowNodeShapeProps = {
  w: number
  h: number
  plugin: string
  pluginName: string
  action: string
  label: string
  description: string
  params: Record<string, string>
  icon: string
  accentColor: string
}

export type FlowNodeShape = TLBaseShape<'flow-node', FlowNodeShapeProps>

export function computeNodeHeight(pluginId: string, action: string): number {
  const cap = getPlugin(pluginId)?.capabilities.find((c) => c.action === action)
  const inputCount = cap?.params?.length ?? 0
  const outputCount = cap?.outputs?.length ?? 0

  let h = 36 // top meta row (icon + plugin + action badge)
  h += 28    // label block
  if (inputCount > 0) h += 14 + inputCount * 17
  if (outputCount > 0) h += 14 + outputCount * 16
  h += 10    // bottom padding

  return Math.max(h, 80)
}

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const

  override isAspectRatioLocked(_shape: FlowNodeShape) { return false }
  override canResize(_shape: FlowNodeShape) { return true }

  getDefaultProps(): FlowNodeShapeProps {
    return {
      w: 200, h: 88,
      plugin: 'system', pluginName: 'System', action: 'output',
      label: 'Output', description: 'Final result',
      params: {}, icon: '▸', accentColor: '#94a3b8',
    }
  }

  getGeometry(shape: FlowNodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  component(shape: FlowNodeShape) {
    const { label, description, params, icon, pluginName, accentColor, w, h, plugin, action } = shape.props

    const cap = getPlugin(plugin)?.capabilities.find((c) => c.action === action)
    const inputDefs = cap?.params ?? []
    const outputKeys = cap?.outputs ?? []

    const mono: React.CSSProperties = { fontFamily: 'Geist Mono, ui-monospace, monospace' }
    const sans: React.CSSProperties = { fontFamily: 'Geist, ui-sans-serif, sans-serif' }

    // Lighten accent for backgrounds
    const accentBg = accentColor + '12'
    const accentBorder = accentColor + '30'

    return (
      <HTMLContainer id={shape.id} style={{ width: w, height: h }}>
        <div style={{
          width: '100%', height: '100%',
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: 12,
          borderLeft: `3px solid ${accentColor}`,
          ...sans,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}>

          {/* ─ Top meta row: icon + plugin name + action pill ─ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 6px 10px', flexShrink: 0 }}>
            {/* Icon in accent-tinted badge */}
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: accentBg, border: `1px solid ${accentBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {icon.trimStart().startsWith('<svg')
                ? <span style={{ width: 11, height: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: icon }} />
                : icon.startsWith('http')
                  ? <img src={icon} alt="" width={11} height={11} style={{ objectFit: 'contain' }} />
                  : <span style={{ fontSize: 10, lineHeight: 1 }}>{icon}</span>
              }
            </div>
            {/* Plugin name */}
            <span style={{ fontSize: 9, fontWeight: 600, color: '#71717a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
              {pluginName}
            </span>
            {/* Action pill */}
            <span style={{
              background: '#f4f4f5', border: '1px solid #e4e4e7',
              borderRadius: 4, padding: '1px 5px',
              fontSize: 7.5, color: '#71717a', ...mono,
              letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {action}
            </span>
          </div>

          {/* ─ Label ─ */}
          <div style={{ padding: '0 10px 6px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#18181b', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </div>
            {description && (
              <div style={{ fontSize: 9, color: '#a1a1aa', lineHeight: 1.3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {description}
              </div>
            )}
          </div>

          {/* ─ Inputs ─ */}
          {inputDefs.length > 0 && (
            <>
              <div style={{ height: 1, background: '#f4f4f5', margin: '0 10px', flexShrink: 0 }} />
              <div style={{ padding: '5px 10px 3px', flexShrink: 0 }}>
                <div style={{ fontSize: 7.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 3 }}>
                  Inputs
                </div>
                {inputDefs.map((inp) => {
                  const filled = params[inp.key]
                  return (
                    <div key={inp.key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minHeight: 15 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: filled ? accentColor : '#e4e4e7', flexShrink: 0, border: filled ? 'none' : '1px solid #d4d4d8' }} />
                      <span style={{ fontSize: 9, color: '#52525b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inp.label}
                      </span>
                      {filled ? (
                        <span style={{ fontSize: 7.5, color: '#3f3f46', background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: 3, padding: '0 4px', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...mono }}>
                          {String(filled).length > 10 ? String(filled).slice(0, 10) + '…' : String(filled)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 7.5, color: '#c4c4c8', fontStyle: 'italic' }}>
                          {inp.required ? 'required' : 'optional'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ─ Outputs ─ */}
          {outputKeys.length > 0 && (
            <>
              <div style={{ height: 1, background: '#f4f4f5', margin: '0 10px', flexShrink: 0 }} />
              <div style={{ padding: '5px 10px 4px', flexShrink: 0 }}>
                <div style={{ fontSize: 7.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 3 }}>
                  Outputs
                </div>
                {outputKeys.map((key) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minHeight: 14 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 1.5, background: '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: '#52525b', ...mono }}>{key}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ flex: 1, minHeight: 0 }} />
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: FlowNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />
  }
}
