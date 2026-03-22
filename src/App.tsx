import { useState } from 'react'
import PromptBar from './components/PromptBar.tsx'
import FlowCanvas from './canvas/FlowCanvas.tsx'
import { parseIntent, type FlowSpec } from './ai/flowParser.ts'

export default function App() {
  const [flow, setFlow] = useState<FlowSpec | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePrompt = async (prompt: string) => {
    setLoading(true)
    setError(null)
    try {
      const spec = await parseIntent(prompt)
      setFlow(spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">FlowTx</span>
          <span className="text-xs text-zinc-500 font-mono">visual transaction builder</span>
        </div>
        {flow && (
          <div className="text-xs text-zinc-400">
            <span className="font-semibold text-zinc-200">{flow.title}</span>
            {' — '}
            {flow.description}
          </div>
        )}
      </header>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {!flow && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
            <p className="text-zinc-600 text-sm">Describe a transaction below to generate a flow</p>
            <div className="flex gap-2 flex-wrap justify-center">
              {[
                'Send 0.5 ETH to vitalik.eth',
                'Find the best ZK builder on Twitter and send them 0.1 ETH',
                'Delegate transfers under 0.01 ETH to my agent',
              ].map((ex) => (
                <button
                  key={ex}
                  className="pointer-events-auto text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                  onClick={() => handlePrompt(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Generating flow…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/80 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-lg z-20">
            {error}
          </div>
        )}

        <FlowCanvas flow={flow} />
      </div>

      {/* Prompt bar */}
      <PromptBar onSubmit={handlePrompt} loading={loading} />
    </div>
  )
}
