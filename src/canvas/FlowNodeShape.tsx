import { HTMLContainer, Rectangle2d, ShapeUtil, type TLBaseShape } from '@tldraw/tldraw'
import { getPlugin } from '../plugins/registry.ts'

export const PLUGIN_CSS_COLORS: Record<string, string> = {
  orange:       '#f97316',
  blue:         '#6366f1',
  green:        '#22c55e',
  red:          '#ef4444',
  violet:       '#a855f7',
  grey:         '#94a3b8',
  'light-blue': '#38bdf8',
  yellow:       '#eab308',
  black:        '#18181b',
  white:        '#94a3b8',
}

export type FlowNodeShapeProps = {
  w: number; h: number
  plugin: string; pluginName: string; action: string
  label: string; description: string
  params: Record<string, string>
  icon: string; accentColor: string
}

export type FlowNodeShape = TLBaseShape<'flow-node', FlowNodeShapeProps>

export function computeNodeHeight(pluginId: string, action: string): number {
  const cap = getPlugin(pluginId)?.capabilities.find((c) => c.action === action)
  const inputCount = cap?.params?.length ?? 0
  const outputCount = cap?.outputs?.length ?? 0

  let h = 58  // header section (icon + name + label + desc)
  if (inputCount > 0) h += 20 + inputCount * 20
  if (outputCount > 0) h += 20 + outputCount * 18
  h += 12     // bottom padding

  return Math.max(h, 90)
}

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const
  override isAspectRatioLocked(_shape: FlowNodeShape) { return false }
  override canResize(_shape: FlowNodeShape) { return true }

  getDefaultProps(): FlowNodeShapeProps {
    return {
      w: 210, h: 90, plugin: 'system', pluginName: 'System',
      action: 'output', label: 'Output', description: 'Final result',
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

    const HEADER_H = 58
    const scrollH = h - HEADER_H - 12

    const renderIcon = () => {
      if (icon.trimStart().startsWith('<svg')) {
        return <span style={{ width: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: icon }} />
      }
      if (icon.startsWith('http')) {
        return <img src={icon} alt="" width={13} height={13} style={{ objectFit: 'contain' }} />
      }
      return <span style={{ fontSize: 11, lineHeight: 1 }}>{icon}</span>
    }

    return (
      <HTMLContainer id={shape.id} style={{ width: w, height: h }}>
        <div style={{
          width: '100%', height: '100%',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
          ...sans, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          userSelect: 'none', pointerEvents: 'none',
        }}>

          {/* ── Header: accent tinted bg ── */}
          <div style={{
            background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
            borderBottom: `1px solid ${accentColor}20`,
            padding: '10px 12px 8px',
            flexShrink: 0,
          }}>
            {/* Top row: icon + plugin name + action chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6,
                background: '#fff',
                boxShadow: `0 1px 3px rgba(0,0,0,0.1), 0 0 0 1px ${accentColor}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {renderIcon()}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 600, color: accentColor,
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {pluginName}
              </span>
              <span style={{
                fontSize: 7.5, color: '#71717a', background: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4,
                padding: '1px 6px', ...mono, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {action}
              </span>
            </div>

            {/* Label + description */}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f0f10', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </div>
            {description && (
              <div style={{ fontSize: 9, color: '#71717a', marginTop: 2, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {description}
              </div>
            )}
          </div>

          {/* ── Scrollable I/O body ── */}
          {(inputDefs.length > 0 || outputKeys.length > 0) && (
            <div
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                maxHeight: scrollH > 0 ? scrollH : undefined,
                pointerEvents: 'all',
                // hide scrollbar but keep scrollable
                scrollbarWidth: 'none',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Inputs */}
              {inputDefs.length > 0 && (
                <div style={{ padding: '8px 12px 6px' }}>
                  <div style={{
                    fontSize: 7.5, fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
                  }}>
                    Inputs
                  </div>
                  {inputDefs.map((inp) => {
                    const filled = params[inp.key]
                    const valStr = filled ? (typeof filled === 'string' ? filled : String(filled)) : null
                    return (
                      <div key={inp.key} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, minHeight: 18 }}>
                        {/* Port indicator */}
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: filled ? accentColor : 'transparent',
                          border: `1.5px solid ${filled ? accentColor : '#d4d4d8'}`,
                          boxShadow: filled ? `0 0 0 2px ${accentColor}20` : 'none',
                        }} />
                        <span style={{ fontSize: 9.5, color: '#3f3f46', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inp.label}
                        </span>
                        {valStr ? (
                          <span style={{
                            fontSize: 8, ...mono, color: '#3f3f46',
                            background: `${accentColor}12`, border: `1px solid ${accentColor}25`,
                            borderRadius: 4, padding: '1px 5px',
                            maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {valStr.length > 12 ? valStr.slice(0, 12) + '…' : valStr}
                          </span>
                        ) : (
                          <span style={{ fontSize: 8, color: '#c4c4c8', fontStyle: 'italic' }}>
                            {inp.required ? 'req' : 'opt'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Divider between IN and OUT */}
              {inputDefs.length > 0 && outputKeys.length > 0 && (
                <div style={{ height: 1, background: '#f4f4f5', margin: '0 12px' }} />
              )}

              {/* Outputs */}
              {outputKeys.length > 0 && (
                <div style={{ padding: '6px 12px 8px' }}>
                  <div style={{
                    fontSize: 7.5, fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
                  }}>
                    Outputs
                  </div>
                  {outputKeys.map((key) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, minHeight: 16 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: 2, flexShrink: 0,
                        background: '#22c55e',
                      }} />
                      <span style={{ fontSize: 9.5, color: '#3f3f46', ...mono, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {key}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: FlowNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={14} ry={14} />
  }
}
