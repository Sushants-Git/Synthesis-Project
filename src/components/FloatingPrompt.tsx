import { useEffect, useRef, useState } from 'react'

interface Props {
  screenX: number
  screenY: number
  mode: 'create' | 'modify'
  loading: boolean
  initialValue?: string
  onSubmit: (prompt: string) => void
  onClose: () => void
}

export default function FloatingPrompt({
  screenX,
  screenY,
  mode,
  loading,
  initialValue = '',
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) {
        onSubmit(value.trim())
        setValue('')
      }
    }
  }

  // Keep prompt inside viewport
  const WIDTH = 360
  const left = Math.min(screenX - WIDTH / 2, window.innerWidth - WIDTH - 16)
  const top = Math.max(screenY - 80, 16)

  return (
    <>
      {/* Backdrop - clicking outside closes */}
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest('.floating-prompt')) onClose()
        }}
      />

      <div
        className="floating-prompt fixed z-50 flex flex-col gap-2"
        style={{ left, top, width: WIDTH }}
      >
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {mode === 'create' ? 'New Flow' : 'Modify Flow'}
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 text-sm leading-none"
            >
              ✕
            </button>
          </div>

          <textarea
            ref={inputRef}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none resize-none min-h-[72px] focus:border-blue-400 transition-colors"
            placeholder={
              mode === 'create'
                ? 'Describe the transaction flow…'
                : 'Describe changes to this flow…'
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-zinc-400">↵ Generate · Esc Cancel</span>
            <button
              onClick={() => {
                if (value.trim() && !loading) {
                  onSubmit(value.trim())
                  setValue('')
                }
              }}
              disabled={!value.trim() || loading}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {loading ? 'Thinking…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Tail */}
        <div
          className="w-2 h-2 bg-zinc-200 rotate-45 mx-auto -mt-3"
          style={{ marginLeft: WIDTH / 2 - 4 }}
        />
      </div>
    </>
  )
}
