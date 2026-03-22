import { useState, type KeyboardEvent } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  loading: boolean
}

export default function PromptBar({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) {
        onSubmit(value.trim())
        setValue('')
      }
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 shadow-2xl">
          <textarea
            className="flex-1 bg-transparent resize-none text-sm text-zinc-100 placeholder-zinc-500 outline-none min-h-[40px] max-h-40"
            placeholder='Try: "Send 0.5 ETH to the best ZK builder on Twitter"'
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            onClick={() => {
              if (value.trim() && !loading) {
                onSubmit(value.trim())
                setValue('')
              }
            }}
            disabled={!value.trim() || loading}
            className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? 'Thinking…' : 'Build Flow'}
          </button>
        </div>
        <p className="text-center text-xs text-zinc-600 mt-2">
          Enter ↵ to submit · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
