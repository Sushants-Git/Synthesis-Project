import { useState, useEffect, useMemo, useRef } from 'react'
import type { FlowSpec, FlowNode } from '../ai/flowParser.ts'
import type { PluginResult, ExecutionContext } from '../plugins/types.ts'
import { getPlugin, substituteVars, loadVarDefaults } from '../plugins/registry.ts'
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
  onModify?: () => void
}

const STATUS_ICON: Record<StepStatus, string> = {
  pending: '○', running: '●', waiting: '◎', done: '●', error: '✕',
}
const STATUS_COLOR: Record<StepStatus, string> = {
  pending: 'text-zinc-300', running: 'text-blue-500', waiting: 'text-amber-500',
  done: 'text-emerald-500', error: 'text-red-500',
}

// ─── Static analysis (for pre-execution display) ─────────────────────────────

function buildUpstreamOutputMap(flow: FlowSpec): Map<string, Set<string>> {
  const nodeOutputKeys = new Map<string, string[]>()
  for (const node of flow.nodes) {
    const cap = getPlugin(node.plugin)?.capabilities.find((c) => c.action === node.action)
    nodeOutputKeys.set(node.id, cap?.outputs ?? [])
  }
  const result = new Map<string, Set<string>>()
  for (const node of flow.nodes) {
    const keys = new Set<string>()
    for (const edge of flow.edges) {
      if (edge.to === node.id) {
        for (const k of (nodeOutputKeys.get(edge.from) ?? [])) keys.add(k)
      }
    }
    result.set(node.id, keys)
  }
  return result
}

function collectTemplateVars(flow: FlowSpec): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  const push = (str: string) => {
    for (const [, key] of str.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!seen.has(key)) { seen.add(key); order.push(key) }
    }
  }
  for (const node of flow.nodes) {
    for (const val of Object.values(node.params ?? {})) push(val)
    const url = getPlugin(node.plugin)?.executeUrl
    if (url) push(url)
  }
  return order
}

// ─── Data rendering ──────────────────────────────────────────────────────────

function DataTable({ rows }: { rows: string[][] }) {
  // rows[0] is header if first element doesn't look like data
  const hasHeader = rows.length > 1 && rows[0] !== undefined
  const header = hasHeader ? rows[0]! : null
  const body = hasHeader ? rows.slice(1) : rows

  return (
    <div className="mt-1 rounded-lg border border-zinc-200 overflow-hidden text-[10px] font-mono">
      {header && (
        <div
          className="grid bg-zinc-100 border-b border-zinc-200 px-2 py-1 gap-2"
          style={{ gridTemplateColumns: `24px repeat(${header.length}, 1fr)` }}
        >
          <span className="text-zinc-300">#</span>
          {header.map((h, i) => (
            <span key={i} className="font-semibold text-zinc-500 truncate">{h}</span>
          ))}
        </div>
      )}
      <div className="max-h-96 overflow-y-auto divide-y divide-zinc-50 bg-white">
        {body.map((row, i) => (
          <div
            key={i}
            className="grid px-2 py-1 gap-2 hover:bg-zinc-50 transition-colors duration-75"
            style={{ gridTemplateColumns: `24px repeat(${row.length}, 1fr)` }}
          >
            <span className="text-zinc-300 text-right">{i + 1}</span>
            {row.map((cell, j) => (
              <span key={j} className="text-zinc-700 truncate" title={cell}>{cell}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataValue({ value, inline = false, defaultExpanded = false }: { value: string; inline?: boolean; defaultExpanded?: boolean }) {
  // Try to parse as array or 2D array
  let flat: string[] | null = null
  let grid: string[][] | null = null
  try {
    const p = JSON.parse(value)
    if (Array.isArray(p)) {
      if (p.length > 0 && Array.isArray(p[0])) {
        grid = (p as unknown[][]).map((row) => (row as unknown[]).map(String))
      } else {
        flat = p.map(String)
      }
    }
  } catch { /* not JSON */ }

  const [expanded, setExpanded] = useState(defaultExpanded || (grid !== null && grid.length <= 20) || (flat !== null && flat.length <= 20))

  if (grid !== null) {
    return (
      <div className={inline ? 'inline-block w-full' : 'w-full'}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[10px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded px-2 py-0.5 hover:bg-violet-100 transition-colors duration-100"
        >
          table · {grid.length} rows {expanded ? '▲' : '▼'}
        </button>
        {expanded && <DataTable rows={grid} />}
      </div>
    )
  }

  if (flat !== null) {
    return (
      <div className={inline ? 'inline-block w-full' : 'w-full'}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[10px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded px-2 py-0.5 hover:bg-violet-100 transition-colors duration-100"
        >
          {flat.length} rows {expanded ? '▲' : '▼'}
        </button>
        {expanded && <DataTable rows={flat.map((v) => [v])} />}
      </div>
    )
  }

  const short = value.length > 38 ? value.slice(0, 36) + '…' : value
  return (
    <span className="text-[10px] font-mono bg-zinc-100 border border-zinc-200 rounded px-2 py-0.5 text-zinc-600">
      {short}
    </span>
  )
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      className="opacity-0 group-hover:opacity-100 shrink-0 text-zinc-400 hover:text-zinc-600 transition-[opacity,color] duration-100 active:scale-90"
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="3.5" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="white"/></svg>
      )}
    </button>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FlowExecutor({ flow, onClose, onModify }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>(
    flow.nodes.map((node) => ({ node, status: 'pending', inputs: {} })),
  )
  const [currentStep, setCurrentStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<ExecutionContext>({ resolved: {}, inputs: {} })
  const [dataStoreOpen, setDataStoreOpen] = useState(false)

  // Per-node outputs tracked both as ref (for async access) and state (for rendering)
  const nodeOutputsRef = useRef<Record<string, Record<string, string>>>({})
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, Record<string, string>>>({})

  const upstreamMap = useMemo(() => buildUpstreamOutputMap(flow), [flow])
  const templateVarNames = useMemo(() => collectTemplateVars(flow), [flow])
  const [templateVarValues, setTemplateVarValues] = useState<Record<string, string>>(() => {
    const defaults = loadVarDefaults()
    return Object.fromEntries(templateVarNames.map((k) => [k, defaults[k] ?? '']))
  })

  useEffect(() => {
    getConnectedAccount().then(setWalletAddress)
    const cleanup = onAccountsChanged((accs) => setWalletAddress(accs[0] ?? null))
    return cleanup
  }, [])

  const updateStep = (i: number, patch: Partial<StepState>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  /** Store a node's outputs in both ref and state. */
  const addNodeOutputs = (nodeId: string, outputs: Record<string, string>) => {
    nodeOutputsRef.current = { ...nodeOutputsRef.current, [nodeId]: outputs }
    setNodeOutputs({ ...nodeOutputsRef.current })
  }

  /**
   * Collect all outputs from nodes that feed directly into nodeId via edges.
   * Uses the ref so it's always current inside async callbacks.
   */
  const getUpstreamData = (nodeId: string): Record<string, string> => {
    const data: Record<string, string> = {}
    for (const edge of flow.edges) {
      if (edge.to === nodeId) {
        Object.assign(data, nodeOutputsRef.current[edge.from] ?? {})
      }
    }
    return data
  }

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWalletAddress(addr)
      setCtx((prev) => ({ ...prev, walletAddress: addr, resolved: { ...prev.resolved, wallet_address: addr } }))
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

    // Inject ALL upstream node outputs into ctx.resolved so plugins can read them
    const upstreamData = getUpstreamData(node.id)
    Object.assign(execCtx.resolved, upstreamData)
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
      const vars = execCtx.templateVars ?? {}

      // Build params: upstream outputs < node params (AI-set) < manual inputs (user-set)
      // This means upstream data is available as fallback but explicit params take precedence
      const rawParams = { ...upstreamData, ...(node.params ?? {}), ...step.inputs }
      const resolvedParams = Object.fromEntries(
        Object.entries(rawParams).map(([k, v]) => [k, substituteVars(v, vars)]),
      )

      const result = await plugin.execute(node.action, resolvedParams, execCtx)

      if (result.outputs) {
        Object.assign(execCtx.resolved, result.outputs)
        addNodeOutputs(node.id, result.outputs)
      }

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
      templateVars: { ...templateVarValues },
    }
    setCtx(execCtx)
    setRunning(true)
    void runFrom(0, execCtx)
  }

  const handleApprove = (index: number) => {
    const step = steps[index]!
    // Pure gate steps (action === 'approve') have no execution logic — just mark done and advance.
    // All other steps with requiresApproval (e.g. send_eth, batch_send) need to actually
    // execute their plugin code; re-run the same index so runFrom picks up from 'waiting' status
    // (the requiresApproval guard only fires on 'pending', so it won't re-pause).
    if (step.node.action === 'approve') {
      updateStep(index, { status: 'done', result: { status: 'done', display: 'Approved ✓' } })
      setRunning(true)
      void runFrom(index + 1, ctx)
    } else {
      setRunning(true)
      void runFrom(index, ctx)
    }
  }

  const hasStarted = steps.some((s) => s.status !== 'pending')
  const isDone = hasStarted && steps.every((s) => ['done', 'error'].includes(s.status))
  const usedPlugins = [...new Set(flow.nodes.map((n) => n.plugin).filter((p) => p !== 'system'))]
  const completedNodeCount = Object.keys(nodeOutputs).length
  const totalOutputCount = Object.values(nodeOutputs).reduce((n, o) => n + Object.keys(o).length, 0)

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] z-50 flex flex-col bg-white border-l border-zinc-200 shadow-2xl shadow-zinc-200/40 overflow-hidden animate-slide-right">

      {/* ─ Header ─ */}
      <div className="px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 leading-tight">{flow.title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{flow.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onModify && (
              <button
                onClick={onModify}
                className="px-2.5 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md transition-[background-color,color] duration-100 active:scale-[0.96]"
              >
                Modify
              </button>
            )}
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 text-sm leading-none transition-colors duration-100 active:scale-[0.9]"
            >
              ✕
            </button>
          </div>
        </div>
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

      {/* ─ Template variables ─ */}
      {templateVarNames.length > 0 && (
        <div className="px-5 py-3 border-b border-zinc-100 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Variables</span>
            <span className="text-[9px] text-zinc-400">used as <code className="font-mono bg-zinc-100 px-1 rounded">{'{{name}}'}</code> in this plugin</span>
          </div>
          {templateVarNames.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] font-mono text-zinc-500 w-28 shrink-0 truncate">{key}</label>
              <input
                type={key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') ? 'password' : 'text'}
                placeholder={`Enter ${key}`}
                value={templateVarValues[key] ?? ''}
                onChange={(e) => setTemplateVarValues((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={hasStarted}
                className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-300 outline-none focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-[border-color,box-shadow] duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          ))}
        </div>
      )}

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

          // Runtime upstream data (populated after upstream nodes complete)
          const runtimeUpstream = getUpstreamData(node.id)

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
                    const runtimeVal = runtimeUpstream[field.key]
                    const resolvedCtxVal = ctx.resolved[field.key]
                    const isFromUpstream = !paramVal && !userVal && (upstreamKeys.has(field.key) || runtimeVal)
                    const actualUpstreamVal = runtimeVal ?? resolvedCtxVal
                    const needsManual = !paramVal && !userVal && !isFromUpstream

                    // Pre-filled by AI (possibly containing {{vars}})
                    if (paramVal) {
                      const resolved = substituteVars(paramVal, templateVarValues)
                      const hasVar = /\{\{/.test(paramVal)
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className={`text-[10px] font-mono border rounded px-2 py-0.5 truncate max-w-[140px] ${
                            hasVar && resolved !== paramVal
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                          }`}>
                            {resolved}
                          </span>
                          <CopyButton value={resolved} />
                        </div>
                      )
                    }

                    // From upstream (show actual value if available, otherwise "auto" tag)
                    if (isFromUpstream) {
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          {actualUpstreamVal ? (
                            <>
                              <DataValue value={actualUpstreamVal} inline />
                              <CopyButton value={actualUpstreamVal} />
                            </>
                          ) : (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 italic">
                              auto · from upstream ↑
                            </span>
                          )}
                        </div>
                      )
                    }

                    // User-entered value — show badge only after step has run; input field handles pending/waiting
                    if (userVal && step.status !== 'pending' && step.status !== 'waiting') {
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 truncate max-w-[140px]">
                            {userVal}
                          </span>
                          <CopyButton value={userVal} />
                        </div>
                      )
                    }

                    // Needs manual input (or user is still editing)
                    if ((needsManual || userVal) && (step.status === 'pending' || step.status === 'waiting')) {
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

              {/* ─ Outputs ─ */}
              {outputKeys.length > 0 && step.status !== 'pending' && (
                <div className="px-3 pb-2 space-y-1.5">
                  <div className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Outputs</div>
                  {outputKeys.map((key) => {
                    const val = step.result?.outputs?.[key]
                    return (
                      <div key={key} className="group flex items-start gap-2">
                        <span className="text-[10px] font-mono text-zinc-400 w-24 shrink-0 truncate pt-0.5">{key}</span>
                        {val ? (
                          <>
                            <div className="flex-1 min-w-0"><DataValue value={val} /></div>
                            <CopyButton value={val} />
                          </>
                        ) : (
                          step.status === 'running'
                            ? <span className="text-[10px] text-zinc-300 italic">…</span>
                            : <span className="text-[10px] text-zinc-300 italic">—</span>
                        )}
                      </div>
                    )
                  })}
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

      {/* ─ Data Store ─ */}
      {completedNodeCount > 0 && (
        <div className="border-t border-zinc-100 shrink-0">
          <button
            onClick={() => setDataStoreOpen(!dataStoreOpen)}
            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-zinc-50 transition-colors duration-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Data Store</span>
              <span className="text-[9px] bg-zinc-100 border border-zinc-200 rounded-full px-2 py-0.5 text-zinc-500 font-mono">
                {totalOutputCount} value{totalOutputCount !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-zinc-400 text-[10px]">{dataStoreOpen ? '▲' : '▼'}</span>
          </button>

          {dataStoreOpen && (
            <div className="px-4 pb-3 space-y-3 max-h-[32rem] overflow-y-auto">
              {flow.nodes
                .filter((n) => nodeOutputs[n.id] && Object.keys(nodeOutputs[n.id]!).length > 0)
                .map((node) => {
                  const plugin = getPlugin(node.plugin)
                  const outputs = nodeOutputs[node.id]!
                  return (
                    <div key={node.id}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-sm">{plugin?.icon ?? '▸'}</span>
                        <span className="text-[10px] font-semibold text-zinc-700">{node.label}</span>
                      </div>
                      <div className="space-y-1.5 pl-5">
                        {Object.entries(outputs).map(([key, val]) => (
                          <div key={key} className="group flex items-start gap-2">
                            <span className="text-[10px] font-mono text-zinc-400 w-20 shrink-0 truncate pt-0.5">{key}</span>
                            <div className="flex-1 min-w-0"><DataValue value={val} /></div>
                            <CopyButton value={val} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ─ Footer ─ */}
      <div className="px-5 py-4 border-t border-zinc-100 shrink-0">
        {isDone ? (
          <div className="text-center text-sm text-emerald-600 font-semibold animate-fade-up">
            Flow complete ✓
          </div>
        ) : !hasStarted ? (
          <button
            onClick={startExecution}
            disabled={running}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-[transform,background-color] duration-150"
          >
            ⚡ Execute Flow
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
