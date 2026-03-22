import { useState, useEffect, useMemo } from 'react'
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
  running: '●',
  waiting: '◎',
  done: '●',
  error: '✕',
}
const STATUS_COLOR: Record<StepStatus, string> = {
  pending: 'text-zinc-300',
  running: 'text-blue-500',
  waiting: 'text-amber-500',
  done: 'text-emerald-500',
  error: 'text-red-500',
}

// ─── Data-flow analysis ──────────────────────────────────────────────────────

/**
 * For each node, returns the set of output keys provided by upstream nodes
 * (via the edge graph), so the executor knows which inputs will be auto-filled.
 */
function buildUpstreamOutputMap(flow: FlowSpec): Map<string, Set<string>> {
  // First pass: capability outputs per node
  const nodeOutputKeys = new Map<string, string[]>()
  for (const node of flow.nodes) {
    const cap = getPlugin(node.plugin)?.capabilities.find((c) => c.action === node.action)
    nodeOutputKeys.set(node.id, cap?.outputs ?? [])
  }

  // Second pass: for each node, union outputs of all predecessors via edges
  const result = new Map<string, Set<string>>()
  for (const node of flow.nodes) {
    const keys = new Set<string>()
    for (const edge of flow.edges) {
      if (edge.to === node.id) {
        for (const k of (nodeOutputKeys.get(edge.from) ?? [])) {
          keys.add(k)
        }
      }
    }
    result.set(node.id, keys)
  }
  return result
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FlowExecutor({ flow, onClose }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>(
    flow.nodes.map((node) => ({ node, status: 'pending', inputs: {} })),
  )
  const [currentStep, setCurrentStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<ExecutionContext>({ resolved: {}, inputs: {} })

  const upstreamMap = useMemo(() => buildUpstreamOutputMap(flow), [flow])

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

    execCtx.inputs = { ...execCtx.inputs, ...step.inputs }

    const cap = plugin?.capabilities.find((c) => c.action === node.action)
    if (cap?.requiresApproval && step.status === 'pending') {
      updateStep(index, { status: 'waiting' })
      return
    }

    updateStep(index, { status: 'running' })

    if (!plugin) {
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
  const usedPlugins = [...new Set(flow.nodes.map((n) => n.plugin).filter((p) => p !== 'system'))]

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] z-50 flex flex-col bg-white border-l border-zinc-200 shadow-2xl shadow-zinc-200/40 overflow-hidden animate-slide-right">

      {/* ─ Header ─ */}
      <div className="px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 leading-tight">{flow.title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{flow.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-sm leading-none mt-0.5 shrink-0 transition-colors duration-100 active:scale-[0.9]"
          >
            ✕
          </button>
        </div>
        {/* Plugin tags */}
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {usedPlugins.map((pid) => {
            const p = getPlugin(pid)
            if (!p) return null
            return (
              <span key={pid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded-full text-[10px] text-zinc-600 font-medium">
                {p.icon} {p.name}
              </span>
            )
          })}
        </div>
      </div>

      {/* ─ Wallet ─ */}
      <div className="px-5 py-3 border-b border-zinc-100 shrink-0">
        {walletAddress ? (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-xs text-zinc-700 font-mono">{shortenAddress(walletAddress)}</span>
            <span className="text-[10px] text-zinc-400 ml-auto">MetaMask connected</span>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full py-2 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white text-sm font-medium rounded-lg transition-[transform,background-color] duration-150 flex items-center justify-center gap-2"
          >
            🦊 Connect MetaMask
          </button>
        )}
      </div>

      {/* ─ Steps ─ */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {steps.map((step, i) => {
          const node = step.node
          const plugin = getPlugin(node.plugin)
          const cap = plugin?.capabilities.find((c) => c.action === node.action)
          type FieldDef = { key: string; label: string; placeholder: string; inputType: string; required?: boolean }
          const allInputDefs = (cap?.params ?? node.requiredInputs ?? []) as FieldDef[]
          const outputKeys = cap?.outputs ?? []
          const upstreamKeys = upstreamMap.get(node.id) ?? new Set<string>()
          const isCurrent = i === currentStep

          return (
            <div
              key={node.id}
              className={`rounded-xl border transition-[background-color,border-color] duration-300 overflow-hidden ${
                isCurrent           ? 'border-blue-200 bg-blue-50/70'
                : step.status === 'done'    ? 'border-emerald-200/70 bg-emerald-50/30'
                : step.status === 'error'   ? 'border-red-200/70 bg-red-50/30'
                : step.status === 'waiting' ? 'border-amber-200/70 bg-amber-50/30'
                : 'border-zinc-100 bg-zinc-50/30'
              }`}
            >
              {/* Step header */}
              <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                <span className="text-base shrink-0 mt-0.5 leading-none">{plugin?.icon ?? '▸'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-800 truncate">{node.label}</span>
                    {step.status === 'running' ? (
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <span className={`text-[10px] font-mono shrink-0 ${STATUS_COLOR[step.status]}`}>
                        {STATUS_ICON[step.status]}
                      </span>
                    )}
                  </div>
                  {plugin && (
                    <span className="text-[10px] text-zinc-400">{plugin.name} · {node.action}</span>
                  )}
                </div>
              </div>

              {/* ─ Inputs ─ */}
              {allInputDefs.length > 0 && (
                <div className="px-3 pb-2 space-y-1.5">
                  <div className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Inputs</div>

                  {allInputDefs.map((field) => {
                    const paramVal = node.params?.[field.key]
                    const userVal = step.inputs[field.key]
                    const resolvedVal = ctx.resolved[field.key]
                    const isFromUpstream = !paramVal && !userVal && upstreamKeys.has(field.key)
                    const needsManual = !paramVal && !userVal && !isFromUpstream

                    // Pre-filled by AI
                    if (paramVal) {
                      return (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className="text-[10px] font-mono bg-zinc-100 border border-zinc-200 text-zinc-700 rounded px-2 py-0.5 truncate max-w-[140px]">
                            {paramVal}
                          </span>
                        </div>
                      )
                    }

                    // Filled from upstream (show annotation, or actual value if resolved)
                    if (isFromUpstream || (resolvedVal && !userVal)) {
                      const displayVal = resolvedVal
                        ? (resolvedVal.length > 30 ? resolvedVal.slice(0, 28) + '…' : resolvedVal)
                        : null
                      return (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          {displayVal ? (
                            <span className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-2 py-0.5 truncate max-w-[140px]">
                              {displayVal}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 italic">
                              auto · from upstream ↑
                            </span>
                          )}
                        </div>
                      )
                    }

                    // User entered value
                    if (userVal) {
                      return (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 truncate max-w-[140px]">
                            {userVal}
                          </span>
                        </div>
                      )
                    }

                    // Needs manual input
                    if (needsManual && (step.status === 'pending' || step.status === 'waiting')) {
                      return (
                        <div key={field.key}>
                          <label className="text-[9px] text-zinc-400 uppercase tracking-wide block mb-0.5">
                            {field.label ?? field.key}
                            {field.required && <span className="text-red-400 ml-1">*</span>}
                          </label>
                          <input
                            type="text"
                            placeholder={field.placeholder ?? field.key}
                            value={step.inputs[field.key] ?? ''}
                            onChange={(e) => updateStep(i, { inputs: { ...step.inputs, [field.key]: e.target.value } })}
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 outline-none focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-[border-color,box-shadow] duration-150"
                          />
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              )}

              {/* ─ Outputs (shown after completion) ─ */}
              {outputKeys.length > 0 && step.status !== 'pending' && (
                <div className="px-3 pb-2 space-y-1">
                  <div className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Outputs</div>
                  <div className="flex flex-wrap gap-1.5">
                    {outputKeys.map((key) => {
                      const val = step.result?.outputs?.[key]
                      const truncated = val
                        ? (val.length > 32 ? val.slice(0, 30) + '…' : val)
                        : null
                      return (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-[9px] font-mono text-zinc-400">{key}</span>
                          {truncated ? (
                            <span className="text-[9px] font-mono bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-600">
                              {truncated}
                            </span>
                          ) : (
                            step.status === 'running'
                              ? <span className="text-[9px] text-zinc-300 italic">…</span>
                              : <span className="text-[9px] text-zinc-300 italic">—</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Step result message */}
              {step.result?.display && (
                <div className="mx-3 mb-2 text-xs font-mono text-zinc-600 bg-zinc-100 rounded-md px-2 py-1.5 break-all border border-zinc-200/60">
                  {step.result.display}
                </div>
              )}
              {step.result?.error && (
                <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5 border border-red-100">
                  {step.result.error}
                </div>
              )}
              {step.result?.txHash && (
                <a
                  href={step.result.link ?? `https://etherscan.io/tx/${step.result.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-3 mb-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors duration-100"
                >
                  View transaction ↗
                </a>
              )}

              {/* Approval */}
              {step.status === 'waiting' && (
                <div className="mx-3 mb-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(i)}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white text-xs font-semibold rounded-lg transition-[transform,background-color] duration-150"
                  >
                    Approve & Continue
                  </button>
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 active:scale-[0.97] text-zinc-600 text-xs rounded-lg transition-[transform,background-color] duration-150"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─ Footer ─ */}
      <div className="px-5 py-4 border-t border-zinc-100 shrink-0">
        {isDone ? (
          <div className="text-center text-sm text-emerald-600 font-semibold animate-fade-up">
            Flow complete ✓
          </div>
        ) : !hasStarted ? (
          <button
            onClick={startExecution}
            disabled={!walletAddress || running}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-[transform,background-color] duration-150"
          >
            {!walletAddress ? 'Connect wallet to execute' : '⚡ Execute Flow'}
          </button>
        ) : (
          <div className="text-center text-xs text-zinc-400">
            {running ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
                Executing…
              </span>
            ) : 'Waiting for approval'}
          </div>
        )}
      </div>
    </div>
  )
}
