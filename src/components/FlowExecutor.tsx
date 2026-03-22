import { useState, useEffect } from 'react'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import {
  executeStep,
  type StepStatus,
  type StepResult,
  type ExecutionContext,
} from '../blockchain/execution.ts'
import {
  connectWallet,
  getConnectedAccount,
  shortenAddress,
  onAccountsChanged,
} from '../blockchain/wallet.ts'

interface StepState {
  node: FlowNode
  status: StepStatus
  result?: StepResult
  inputs: Record<string, string>
}

interface Props {
  flow: FlowSpec
  onClose: () => void
}

const STATUS_ICON: Record<StepStatus, string> = {
  pending: '○',
  waiting: '◎',
  running: '◌',
  done: '●',
  error: '✕',
  skipped: '–',
}

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: 'text-zinc-500',
  waiting: 'text-yellow-400',
  running: 'text-blue-400',
  done: 'text-green-400',
  error: 'text-red-400',
  skipped: 'text-zinc-600',
}

const TYPE_ICON: Record<string, string> = {
  wallet: '💼',
  ens_resolve: '🔍',
  approval_gate: '🔐',
  action: '⚡',
  output: '✅',
  filter: '🔀',
  api_call: '🌐',
  twitter_search: '🐦',
}

export default function FlowExecutor({ flow, onClose }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>(
    flow.nodes.map((node) => ({
      node,
      status: 'pending',
      inputs: {},
    })),
  )
  const [currentStep, setCurrentStep] = useState<number>(-1)
  const [running, setRunning] = useState(false)
  const [executionCtx, setExecutionCtx] = useState<ExecutionContext | null>(null)

  // Check if wallet already connected
  useEffect(() => {
    getConnectedAccount().then((acc) => setWalletAddress(acc))
    const cleanup = onAccountsChanged((accounts) =>
      setWalletAddress(accounts[0] ?? null),
    )
    return cleanup
  }, [])

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWalletAddress(addr)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to connect wallet')
    }
  }

  const updateStep = (index: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const handleInputChange = (stepIndex: number, key: string, value: string) => {
    updateStep(stepIndex, {
      inputs: { ...steps[stepIndex]!.inputs, [key]: value },
    })
  }

  const startExecution = async () => {
    if (!walletAddress) return
    const ctx: ExecutionContext = {
      walletAddress,
      resolved: {},
      inputs: {},
    }
    setExecutionCtx(ctx)
    setRunning(true)
    await runNextStep(0, ctx)
  }

  const runNextStep = async (index: number, ctx: ExecutionContext) => {
    if (index >= steps.length) {
      setRunning(false)
      setCurrentStep(-1)
      return
    }

    const step = steps[index]!
    const node = step.node
    setCurrentStep(index)

    // Merge user inputs for this step into context
    ctx.inputs = { ...ctx.inputs, ...step.inputs }

    // Approval gate: pause and wait for user click
    if (node.executionType === 'approval') {
      updateStep(index, { status: 'waiting' })
      return // will resume via handleApprove
    }

    updateStep(index, { status: 'running' })

    try {
      const result = await executeStep(node, ctx)

      if (result.status === 'error') {
        updateStep(index, { status: 'error', result })
        setRunning(false)
      } else if (result.status === 'waiting') {
        updateStep(index, { status: 'waiting', result })
        // stays paused
      } else {
        updateStep(index, { status: 'done', result })
        await runNextStep(index + 1, ctx)
      }
    } catch (e) {
      updateStep(index, {
        status: 'error',
        result: { status: 'error', error: e instanceof Error ? e.message : String(e) },
      })
      setRunning(false)
    }
  }

  const handleApprove = async (index: number) => {
    if (!executionCtx) return
    updateStep(index, { status: 'done', result: { status: 'done', display: 'Approved' } })
    setRunning(true)
    await runNextStep(index + 1, executionCtx)
  }

  const isReady = steps.every((s) => {
    const missing = (s.node.requiredInputs ?? []).filter(
      (f) => !s.inputs[f.key] && !s.node.params?.[f.key],
    )
    return missing.length === 0
  })

  const hasStarted = steps.some((s) => s.status !== 'pending')
  const isDone = steps.every((s) =>
    ['done', 'skipped', 'error'].includes(s.status),
  )

  return (
    <div className="fixed right-0 top-0 h-full w-[380px] z-50 flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{flow.title}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{flow.description}</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">
          ✕
        </button>
      </div>

      {/* Wallet strip */}
      <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
        {walletAddress ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-xs text-zinc-300 font-mono">{shortenAddress(walletAddress)}</span>
            <span className="text-xs text-zinc-600 ml-auto">Connected</span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {steps.map((step, i) => {
          const node = step.node
          const isCurrent = i === currentStep
          const missingInputs = (node.requiredInputs ?? []).filter(
            (f) => !node.params?.[f.key],
          )

          return (
            <div
              key={node.id}
              className={`rounded-xl border p-3 transition-colors ${
                isCurrent
                  ? 'border-blue-500/50 bg-blue-950/30'
                  : step.status === 'done'
                  ? 'border-green-800/40 bg-green-950/10'
                  : step.status === 'error'
                  ? 'border-red-800/40 bg-red-950/10'
                  : step.status === 'waiting'
                  ? 'border-yellow-700/40 bg-yellow-950/10'
                  : 'border-zinc-800 bg-zinc-900/50'
              }`}
            >
              {/* Step header */}
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">
                  {TYPE_ICON[node.type] ?? '▸'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {node.label}
                    </span>
                    <span
                      className={`text-xs font-mono shrink-0 ${STATUS_COLOR[step.status]}`}
                    >
                      {step.status === 'running' ? '⟳' : STATUS_ICON[step.status]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-snug">
                    {node.description}
                  </p>
                </div>
              </div>

              {/* Pre-filled params */}
              {node.params && Object.keys(node.params).length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {Object.entries(node.params).map(([k, v]) => (
                    <div key={k} className="bg-zinc-800/60 rounded-md px-2 py-1">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{k}</div>
                      <div className="text-xs text-zinc-200 font-mono truncate">{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Required inputs */}
              {missingInputs.length > 0 && step.status === 'pending' && (
                <div className="mt-2 space-y-1.5">
                  {missingInputs.map((field) => (
                    <div key={field.key}>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wide block mb-0.5">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        placeholder={field.placeholder}
                        value={step.inputs[field.key] ?? ''}
                        onChange={(e) => handleInputChange(i, field.key, e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Result display */}
              {step.result?.display && (
                <div className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-800/40 rounded-md px-2 py-1 truncate">
                  {step.result.display}
                </div>
              )}
              {step.result?.error && (
                <div className="mt-2 text-xs text-red-400 bg-red-950/30 rounded-md px-2 py-1">
                  {step.result.error}
                </div>
              )}

              {/* Tx hash link */}
              {step.result?.data?.txHash && (
                <a
                  href={`https://etherscan.io/tx/${step.result.data.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  View on Etherscan ↗
                </a>
              )}

              {/* Approval gate action */}
              {step.status === 'waiting' && node.executionType === 'approval' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(i)}
                    className="flex-1 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
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

      {/* Footer action */}
      <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
        {isDone ? (
          <div className="text-center text-sm text-green-400 font-medium">
            Flow complete ✓
          </div>
        ) : !hasStarted ? (
          <button
            onClick={startExecution}
            disabled={!walletAddress || !isReady || running}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {!walletAddress ? 'Connect wallet first' : 'Execute Flow'}
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
