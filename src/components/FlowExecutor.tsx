import { useState, useEffect } from 'react'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import type { PluginResult, ExecutionContext } from '../plugins/types.ts'
import { getPlugin } from '../plugins/registry.ts'
import {
  connectWallet,
  getConnectedAccount,
  shortenAddress,
  onAccountsChanged,
} from '../blockchain/wallet.ts'

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'waiting'

interface StepState {
  node: FlowNode
  status: StepStatus
  result?: PluginResult
  inputs: Record<string, string>
}

interface Props {
  flow: FlowSpec
  onClose: () => void
}

const STATUS_ICON: Record<StepStatus, string> = {
  pending: '○',
  running: '◌',
  waiting: '◎',
  done: '●',
  error: '✕',
}
const STATUS_COLOR: Record<StepStatus, string> = {
  pending: 'text-zinc-500',
  running: 'text-blue-400',
  waiting: 'text-yellow-400',
  done: 'text-green-400',
  error: 'text-red-400',
}

export default function FlowExecutor({ flow, onClose }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>(
    flow.nodes.map((node) => ({ node, status: 'pending', inputs: {} })),
  )
  const [currentStep, setCurrentStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<ExecutionContext>({ resolved: {}, inputs: {} })

  useEffect(() => {
    getConnectedAccount().then(setWalletAddress)
    const cleanup = onAccountsChanged((accs) => setWalletAddress(accs[0] ?? null))
    return cleanup
  }, [])

  const updateStep = (i: number, patch: Partial<StepState>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWalletAddress(addr)
      ctx.walletAddress = addr
      ctx.resolved.wallet_address = addr
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to connect wallet')
    }
  }

  const runFrom = async (index: number, execCtx: ExecutionContext) => {
    if (index >= steps.length) { setRunning(false); setCurrentStep(-1); return }

    const step = steps[index]!
    const node = step.node
    const plugin = getPlugin(node.plugin)
    setCurrentStep(index)

    // Merge this step's user inputs into context
    execCtx.inputs = { ...execCtx.inputs, ...step.inputs }

    // Check if the plugin capability requires approval (pause before executing)
    const cap = plugin?.capabilities.find((c) => c.action === node.action)
    if (cap?.requiresApproval && step.status === 'pending') {
      updateStep(index, { status: 'waiting' })
      return // user must click Approve
    }

    updateStep(index, { status: 'running' })

    if (!plugin) {
      // System node (output, filter, note)
      updateStep(index, { status: 'done', result: { status: 'done', display: node.description } })
      await runFrom(index + 1, execCtx)
      return
    }

    try {
      const result = await plugin.execute(node.action, { ...(node.params ?? {}), ...step.inputs }, execCtx)
      if (result.outputs) Object.assign(execCtx.resolved, result.outputs)

      if (result.status === 'error') {
        updateStep(index, { status: 'error', result })
        setRunning(false)
      } else if (result.status === 'waiting') {
        updateStep(index, { status: 'waiting', result })
        // stays paused — user clicks Approve
      } else {
        updateStep(index, { status: 'done', result })
        await runFrom(index + 1, execCtx)
      }
    } catch (e) {
      updateStep(index, {
        status: 'error',
        result: { status: 'error', error: e instanceof Error ? e.message : String(e) },
      })
      setRunning(false)
    }
  }

  const startExecution = () => {
    const execCtx: ExecutionContext = {
      walletAddress: walletAddress ?? undefined,
      resolved: walletAddress ? { wallet_address: walletAddress } : {},
      inputs: {},
    }
    setCtx(execCtx)
    setRunning(true)
    void runFrom(0, execCtx)
  }

  const handleApprove = (index: number) => {
    updateStep(index, { status: 'done', result: { status: 'done', display: 'Approved ✓' } })
    setRunning(true)
    void runFrom(index + 1, ctx)
  }

  const hasStarted = steps.some((s) => s.status !== 'pending')
  const isDone = hasStarted && steps.every((s) => ['done', 'error'].includes(s.status))

  // Which plugins are used in this flow
  const usedPlugins = [...new Set(flow.nodes.map((n) => n.plugin).filter((p) => p !== 'system'))]

  return (
    <div className="fixed right-0 top-0 h-full w-[400px] z-50 flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 leading-tight">{flow.title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{flow.description}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-base shrink-0">✕</button>
        </div>
        {/* Plugin tags */}
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {usedPlugins.map((pid) => {
            const p = getPlugin(pid)
            if (!p) return null
            return (
              <span key={pid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-400">
                {p.icon} {p.name}
              </span>
            )
          })}
        </div>
      </div>

      {/* Wallet */}
      <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
        {walletAddress ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-zinc-300 font-mono">{shortenAddress(walletAddress)}</span>
            <span className="text-xs text-zinc-600 ml-auto">MetaMask connected</span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            🦊 Connect MetaMask
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {steps.map((step, i) => {
          const node = step.node
          const plugin = getPlugin(node.plugin)
          const missingInputs = (node.requiredInputs ?? []).filter(
            (f) => !node.params?.[f.key] && !step.inputs[f.key],
          )
          const isCurrent = i === currentStep

          return (
            <div
              key={node.id}
              className={`rounded-xl border p-3 transition-all ${
                isCurrent ? 'border-blue-500/50 bg-blue-950/20'
                : step.status === 'done' ? 'border-green-800/30 bg-green-950/10'
                : step.status === 'error' ? 'border-red-800/30 bg-red-950/10'
                : step.status === 'waiting' ? 'border-yellow-700/30 bg-yellow-950/10'
                : 'border-zinc-800/60 bg-zinc-900/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-base shrink-0 mt-0.5">{plugin?.icon ?? '▸'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">{node.label}</span>
                    <span className={`text-xs font-mono shrink-0 ${STATUS_COLOR[step.status]}`}>
                      {step.status === 'running' ? '⟳' : STATUS_ICON[step.status]}
                    </span>
                  </div>
                  {plugin && (
                    <span className="text-[10px] text-zinc-600">{plugin.name} · {node.action}</span>
                  )}
                  <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{node.description}</p>
                </div>
              </div>

              {/* Pre-filled params */}
              {node.params && Object.keys(node.params).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(node.params).map(([k, v]) => (
                    <div key={k} className="bg-zinc-800/70 rounded px-2 py-0.5">
                      <span className="text-[10px] text-zinc-500">{k}: </span>
                      <span className="text-[10px] text-zinc-300 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Required inputs (only shown for pending/waiting steps) */}
              {missingInputs.length > 0 && (step.status === 'pending' || step.status === 'waiting') && (
                <div className="mt-2 space-y-1.5">
                  {missingInputs.map((field) => (
                    <div key={field.key}>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wide block mb-0.5">{field.label}</label>
                      <input
                        type="text"
                        placeholder={field.placeholder}
                        value={step.inputs[field.key] ?? ''}
                        onChange={(e) => updateStep(i, { inputs: { ...step.inputs, [field.key]: e.target.value } })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Step result */}
              {step.result?.display && (
                <div className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-800/40 rounded px-2 py-1 break-all">
                  {step.result.display}
                </div>
              )}
              {step.result?.error && (
                <div className="mt-2 text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">
                  {step.result.error}
                </div>
              )}
              {step.result?.txHash && (
                <a
                  href={step.result.link ?? `https://etherscan.io/tx/${step.result.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  View transaction ↗
                </a>
              )}

              {/* Approval / user pick */}
              {step.status === 'waiting' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(i)}
                    className="flex-1 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Approve & Continue
                  </button>
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
        {isDone ? (
          <div className="text-center text-sm text-green-400 font-semibold">Flow complete ✓</div>
        ) : !hasStarted ? (
          <button
            onClick={startExecution}
            disabled={!walletAddress || running}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {!walletAddress ? 'Connect wallet to execute' : '⚡ Execute Flow'}
          </button>
        ) : (
          <div className="text-center text-xs text-zinc-600">
            {running ? 'Executing…' : 'Waiting for approval'}
          </div>
        )}
      </div>
    </div>
  )
}
