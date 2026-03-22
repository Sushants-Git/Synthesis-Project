import { HTMLContainer, Rectangle2d, ShapeUtil, type TLBaseShape } from '@tldraw/tldraw'

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
  /** Plugin id — 'system' for generic nodes */
  plugin: string
  /** Human-readable plugin name shown in the header */
  pluginName: string
  action: string
  label: string
  description: string
  /** Key→value params extracted from the prompt */
  params: Record<string, string>
  icon: string
  /** CSS hex color used as the card header accent */
  accentColor: string
}

export type FlowNodeShape = TLBaseShape<'flow-node', FlowNodeShapeProps>

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const

  override isAspectRatioLocked(_shape: FlowNodeShape) {
    return false
  }
  override canResize(_shape: FlowNodeShape) {
    return true
  }

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
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  component(shape: FlowNodeShape) {
    const { label, description, params, icon, pluginName, accentColor, w, h } = shape.props
    const paramEntries = Object.entries(params).filter(([, v]) => v)

    return (
      <HTMLContainer id={shape.id} style={{ width: w, height: h }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#ffffff',
            border: '1.5px solid #e4e4e7',
            borderRadius: 10,
            fontFamily: 'Geist, ui-sans-serif, sans-serif',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {/* Accent header — plugin identity */}
          <div
            style={{
              background: accentColor,
              padding: '5px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                opacity: 0.95,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pluginName}
            </span>
            {/* Action badge */}
            <span
              style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 8,
                color: 'rgba(255,255,255,0.9)',
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}
            >
              {shape.props.action}
            </span>
          </div>

          {/* Body */}
          <div
            style={{
              padding: '8px 10px 8px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              minHeight: 0,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#18181b',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
            {description && (
              <div
                style={{
                  fontSize: 10,
                  color: '#71717a',
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {description}
              </div>
            )}

            {/* Param pills */}
            {paramEntries.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                {paramEntries.slice(0, 3).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      background: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 9,
                      color: '#3f3f46',
                      fontFamily: 'Geist Mono, ui-monospace, monospace',
                      maxWidth: w - 28,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom accent strip — connector hint */}
          <div
            style={{
              height: 2,
              background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)`,
              flexShrink: 0,
            }}
          />
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: FlowNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} ry={10} />
  }
}
