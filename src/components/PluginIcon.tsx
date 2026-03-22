interface Props {
  icon: string
  size?: number
  className?: string
}

/**
 * Renders a plugin icon — supports:
 *  - Raw SVG strings  (<svg ...>)
 *  - Image URLs       (http... / https...)
 *  - Emoji / text     (fallback)
 */
export default function PluginIcon({ icon, size = 16, className = '' }: Props) {
  if (icon.trimStart().startsWith('<svg')) {
    return (
      <span
        className={className}
        style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    )
  }

  if (icon.startsWith('http')) {
    return (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }

  return (
    <span className={`leading-none shrink-0 ${className}`} style={{ fontSize: size }}>
      {icon}
    </span>
  )
}
