import { HTMLContainer, Rectangle2d, ShapeUtil, type TLBaseShape } from '@tldraw/tldraw'
import { getPlugin } from '../plugins/registry.ts'

/** Map tldraw-style plugin color names → CSS hex accent colors */
export const PLUGIN_CSS_COLORS: Record<string, string> = {
  orange: '#ea580c',
  blue: '#4f46e5',
  green: '#16a34a',
  red: '#dc2626',
  violet: '#7c3aed',
  grey: '#6b7280',
  'light-blue': '#0284c7',
  yellow: '#d97706',
  black: '#18181b',
  white: '#94a3b8',
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

/**
 * Compute the height a flow-node card should be given its plugin + action.
 * Accounts for IN and OUT sections derived from the capability definition.
 */
export function computeNodeHeight(pluginId: string, action: string): number {
  const cap = getPlugin(pluginId)?.capabilities.find((c) => c.action === action)
  const inputCount = cap?.params?.length ?? 0
  const outputCount = cap?.outputs?.length ?? 0

  let h = 28 // accent header
  h += 38 // label + description block (6px top pad + label + desc + 4px bottom pad)
  if (inputCount > 0) h += 16 + inputCount * 18 // "IN" label row + input rows
  if (outputCount > 0) h += 16 + outputCount * 16 // "OUT" label row + output rows
  h += 6 // bottom gradient strip

  return Math.max(h, 82)
}

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const

  override isAspectRatioLocked(_shape: FlowNodeShape) { return false }
  override canResize(_shape: FlowNodeShape) { return true }

  getDefaultProps(): FlowNodeShapeProps {
    return {
      w: 200,
      h: 88,
      plugin: 'system',
      pluginName: 'System',
      action: 'output',
      label: 'Output',
      description: 'Final result',
      params: {},
      icon: '▸',
      accentColor: '#6b7280',
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

    return (
      <HTMLContainer id={shape.id} style={{ width: w, height: h }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#ffffff',
            border: '1.5px solid #e4e4e7',
            borderRadius: 10,
            ...sans,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {/* ─ Accent header ─ */}
          <div style={{ background: accentColor, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.07em', textTransform: 'uppercase', opacity: 0.95, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pluginName}
            </span>
            <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontSize: 8, color: 'rgba(255,255,255,0.9)', ...mono, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
              {action}
            </span>
          </div>

          {/* ─ Label + description ─ */}
          <div style={{ padding: '6px 10px 4px', flexShrink: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#18181b', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </div>
            {description && (
              <div style={{ fontSize: 9.5, color: '#71717a', lineHeight: 1.35, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {description}
              </div>
            )}
          </div>

          {/* ─ Inputs ─ */}
          {inputDefs.length > 0 && (
            <>
              <div style={{ height: 1, background: '#f4f4f5', margin: '0 10px', flexShrink: 0 }} />
              <div style={{ padding: '3px 10px 3px', flexShrink: 0 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                  IN
                </div>
                {inputDefs.map((inp) => {
                  const filled = params[inp.key]
                  return (
                    <div key={inp.key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minHeight: 16 }}>
                      {/* port dot */}
                      <span style={{ fontSize: 7, color: filled ? accentColor : '#d4d4d8', flexShrink: 0 }}>
                        {filled ? '●' : '○'}
                      </span>
                      <span style={{ fontSize: 9.5, color: '#52525b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inp.label}
                      </span>
                      {filled ? (
                        <span style={{ fontSize: 8, color: '#3f3f46', background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: 3, padding: '0 4px', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...mono }}>
                          {filled}
                        </span>
                      ) : (
                        <span style={{ fontSize: 8, color: '#c4c4c8', fontStyle: 'italic' }}>
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
              <div style={{ padding: '3px 10px 4px', flexShrink: 0 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                  OUT
                </div>
                {outputKeys.map((key) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minHeight: 14 }}>
                    <span style={{ fontSize: 7, color: '#22c55e', flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 9.5, color: '#52525b', ...mono }}>{key}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ flex: 1, minHeight: 0 }} />

          {/* ─ Bottom accent strip ─ */}
          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)`, flexShrink: 0 }} />
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: FlowNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} ry={10} />
  }
}
