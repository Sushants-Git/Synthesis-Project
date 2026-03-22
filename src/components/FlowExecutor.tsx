import { useState, useEffect, useMemo, useRef } from 'react'
import PluginIcon from './PluginIcon.tsx'
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

/** Plugins that require a wallet connection */
const WALLET_PLUGINS = new Set(['metamask', 'ens', 'status', 'self'])

// ─── Static analysis ─────────────────────────────────────────────────────────

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
    for (const val of Object.values(node.params ?? {})) if (typeof val === 'string') push(val)
    const url = getPlugin(node.plugin)?.executeUrl
    if (url) push(url)
  }
  return order
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DataTable({ rows }: { rows: string[][] }) {
  const hasHeader = rows.length > 1 && rows[0] !== undefined
  const header = hasHeader ? rows[0]! : null
  const body = hasHeader ? rows.slice(1) : rows

  return (
    <div className="mt-1 rounded-lg border border-zinc-200 overflow-hidden text-[10px] font-mono">
      {header && (
        <div className="grid bg-zinc-100 border-b border-zinc-200 px-2 py-1 gap-2"
          style={{ gridTemplateColumns: `24px repeat(${header.length}, 1fr)` }}>
          <span className="text-zinc-300">#</span>
          {header.map((h, i) => <span key={i} className="font-semibold text-zinc-500 truncate">{h}</span>)}
        </div>
      )}
      <div className="max-h-96 overflow-y-auto divide-y divide-zinc-50 bg-white">
        {body.map((row, i) => (
          <div key={i} className="grid px-2 py-1 gap-2 hover:bg-zinc-50 transition-colors duration-75"
            style={{ gridTemplateColumns: `24px repeat(${row.length}, 1fr)` }}>
            <span className="text-zinc-300 text-right">{i + 1}</span>
            {row.map((cell, j) => <span key={j} className="text-zinc-700 truncate" title={cell}>{cell}</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataValue({ value, inline = false }: { value: string; inline?: boolean }) {
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

  const [expanded, setExpanded] = useState(
    (grid !== null && grid.length <= 20) || (flat !== null && flat.length <= 20)
  )

  if (grid !== null) {
    return (
      <div className={inline ? 'inline-block w-full' : 'w-full'}>
        <button onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[10px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded px-2 py-0.5 hover:bg-violet-100 transition-colors duration-100">
          table · {grid.length} rows {expanded ? '▲' : '▼'}
        </button>
        {expanded && <DataTable rows={grid} />}
      </div>
    )
  }

  if (flat !== null) {
    return (
      <div className={inline ? 'inline-block w-full' : 'w-full'}>
        <button onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[10px] font-mono bg-violet-50 border border-violet-200 text-violet-700 rounded px-2 py-0.5 hover:bg-violet-100 transition-colors duration-100">
          {flat.length} items {expanded ? '▲' : '▼'}
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

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} title="Copy"
      className="opacity-0 group-hover:opacity-100 shrink-0 text-zinc-400 hover:text-zinc-600 transition-[opacity,color] duration-100 active:scale-90">
      {copied
        ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="3.5" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="white"/></svg>
      }
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FlowExecutor({ flow, onClose, onModify }: Props) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>(
    flow.nodes.map((node) => ({ node, status: 'pending', inputs: {} })),
  )
  const [currentStep, setCurrentStep] = useState(-1)
  const [running, setRunning] = useState(false)
  const [ctx, setCtx] = useState<ExecutionContext>({ resolved: {}, inputs: {} })
  const [dataStoreOpen, setDataStoreOpen] = useState(false)

  const nodeOutputsRef = useRef<Record<string, Record<string, string>>>({})
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, Record<string, string>>>({})

  const upstreamMap = useMemo(() => buildUpstreamOutputMap(flow), [flow])
  const templateVarNames = useMemo(() => collectTemplateVars(flow), [flow])
  const [templateVarValues, setTemplateVarValues] = useState<Record<string, string>>(() => {
    const defaults = loadVarDefaults()
    return Object.fromEntries(templateVarNames.map((k) => [k, defaults[k] ?? '']))
  })

  // Only require wallet when the flow uses wallet-dependent plugins
  const needsWallet = flow.nodes.some((n) => WALLET_PLUGINS.has(n.plugin))

  useEffect(() => {
    if (!needsWallet) return
    getConnectedAccount().then(setWalletAddress)
    const cleanup = onAccountsChanged((accs) => setWalletAddress(accs[0] ?? null))
    return cleanup
  }, [needsWallet])

  const updateStep = (i: number, patch: Partial<StepState>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const addNodeOutputs = (nodeId: string, outputs: Record<string, string>) => {
    nodeOutputsRef.current = { ...nodeOutputsRef.current, [nodeId]: outputs }
    setNodeOutputs({ ...nodeOutputsRef.current })
  }

  const getUpstreamData = (nodeId: string): Record<string, string> => {
    const data: Record<string, string> = {}
    for (const edge of flow.edges) {
      if (edge.to === nodeId) Object.assign(data, nodeOutputsRef.current[edge.from] ?? {})
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
    <div
      className="fixed right-0 top-0 h-full w-[400px] z-50 flex flex-col bg-white border-l border-zinc-100 shadow-2xl shadow-zinc-900/10 overflow-hidden animate-slide-right"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      {/* ─ Header ─ */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 leading-tight truncate">{flow.title}</h2>
            {flow.description && (
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug line-clamp-2">{flow.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onModify && (
              <button
                onClick={onModify}
                className="px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-[background-color,color] duration-100 active:scale-[0.96]"
              >
                Modify
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-[background-color,color] duration-100 active:scale-90"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Plugin chips */}
        <div className="flex gap-1.5 flex-wrap">
          {usedPlugins.map((pid) => {
            const p = getPlugin(pid)
            if (!p) return null
            return (
              <span key={pid} className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 font-medium">
                <PluginIcon icon={p.icon} size={11} />
                {p.name}
              </span>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-zinc-100 mx-5 shrink-0" />

      {/* ─ Wallet (only when needed) ─ */}
      {needsWallet && (
        <div className="px-5 py-3 shrink-0">
          {walletAddress ? (
            <div className="flex items-center gap-2 py-2 px-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[11px] text-emerald-800 font-mono flex-1">{shortenAddress(walletAddress)}</span>
              <span className="text-[9px] text-emerald-500 font-medium uppercase tracking-wide">connected</span>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full py-2.5 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white text-[11px] font-semibold rounded-xl transition-[transform,background-color] duration-150"
            >
              <PluginIcon icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 240"><path fill="#E17726" d="M250.066 0L140.219 81.279l20.427-47.9z"/><path fill="#E27625" d="m6.191.096l89.181 33.289l19.396 48.528zM205.86 172.858l48.551.924l-16.968 57.642l-59.243-16.311zm-155.721 0l27.557 42.255l-59.143 16.312l-16.865-57.643z"/><path fill="#E27625" d="m112.131 69.552l1.984 64.083l-59.371-2.701l16.888-25.478l.214-.245zm31.123-.715l40.9 36.376l.212.244l16.888 25.478l-59.358 2.7zM79.435 173.044l32.418 25.259l-37.658 18.181zm97.136-.004l5.131 43.445l-37.553-18.184z"/><path fill="#D5BFB2" d="m144.978 195.922l38.107 18.452l-35.447 16.846l.368-11.134zm-33.967.008l-2.909 23.974l.239 11.303l-35.53-16.833z"/><path fill="#233447" d="m100.007 141.999l9.958 20.928l-33.903-9.932zm55.985.002l24.058 10.994l-34.014 9.929z"/><path fill="#CC6228" d="m82.026 172.83l-5.48 45.04l-29.373-44.055zm91.95.001l34.854.984l-29.483 44.057zm28.136-44.444l-25.365 25.851l-19.557-8.937l-9.363 19.684l-6.138-33.849zm-148.237 0l60.435 2.749l-6.139 33.849l-9.365-19.681l-19.453 8.935z"/><path fill="#E27525" d="m52.166 123.082l28.698 29.121l.994 28.749zm151.697-.052l-29.746 57.973l1.12-28.8zm-90.956 1.826l1.155 7.27l2.854 18.111l-1.835 55.625l-8.675-44.685l-.003-.462zm30.171-.101l6.521 35.96l-.003.462l-8.697 44.797l-.344-11.205l-1.357-44.862z"/><path fill="#F5841F" d="m177.788 151.046l-.971 24.978l-30.274 23.587l-6.12-4.324l6.86-35.335zm-99.471 0l30.399 8.906l6.86 35.335l-6.12 4.324l-30.275-23.589z"/><path fill="#C0AC9D" d="m67.018 208.858l38.732 18.352l-.164-7.837l3.241-2.845h38.334l3.358 2.835l-.248 7.831l38.487-18.29l-18.728 15.476l-22.645 15.553h-38.869l-22.63-15.617z"/><path fill="#161616" d="m142.204 193.479l5.476 3.869l3.209 25.604l-4.644-3.921h-36.476l-4.556 4l3.104-25.681l5.478-3.871z"/><path fill="#763E1A" d="M242.814 2.25L256 41.807l-8.235 39.997l5.864 4.523l-7.935 6.054l5.964 4.606l-7.897 7.191l4.848 3.511l-12.866 15.026l-52.77-15.365l-.457-.245l-38.027-32.078zm-229.628 0l98.326 72.777l-38.028 32.078l-.457.245l-52.77 15.365l-12.866-15.026l4.844-3.508l-7.892-7.194l5.952-4.601l-8.054-6.071l6.085-4.526L0 41.809z"/><path fill="#F5841F" d="m180.392 103.99l55.913 16.279l18.165 55.986h-47.924l-33.02.416l24.014-46.808zm-104.784 0l-17.151 25.873l24.017 46.808l-33.005-.416H1.631l18.063-55.985zm87.776-70.878l-15.639 42.239l-3.319 57.06l-1.27 17.885l-.101 45.688h-30.111l-.098-45.602l-1.274-17.986l-3.32-57.045l-15.637-42.239z"/></svg>' size={14} />
              Connect Wallet
            </button>
          )}
        </div>
      )}

      {/* ─ Template variables ─ */}
      {templateVarNames.length > 0 && (
        <div className="px-5 py-3 border-t border-zinc-100 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Variables</span>
            <span className="text-[9px] text-zinc-300">use <code className="font-mono">{'{{name}}'}</code> in params</span>
          </div>
          {templateVarNames.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-[10px] font-mono text-zinc-400 w-28 shrink-0 truncate">{key}</label>
              <input
                type={key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') ? 'password' : 'text'}
                placeholder={`Enter ${key}`}
                value={templateVarValues[key] ?? ''}
                onChange={(e) => setTemplateVarValues((prev) => ({ ...prev, [key]: e.target.value }))}
                disabled={hasStarted}
                className="flex-1 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-300 outline-none focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
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
          const runtimeUpstream = getUpstreamData(node.id)

          return (
            <div
              key={node.id}
              className={`rounded-xl border transition-[background-color,border-color] duration-300 overflow-hidden ${
                isCurrent           ? 'border-blue-200 bg-blue-50/50'
                : step.status === 'done'    ? 'border-emerald-200/60 bg-emerald-50/20'
                : step.status === 'error'   ? 'border-red-200/60 bg-red-50/20'
                : step.status === 'waiting' ? 'border-amber-200/60 bg-amber-50/20'
                : 'border-zinc-100 bg-white'
              }`}
            >
              {/* Step header */}
              <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isCurrent ? 'bg-blue-100' : step.status === 'done' ? 'bg-emerald-50' : step.status === 'error' ? 'bg-red-50' : 'bg-zinc-100'
                }`}>
                  {plugin
                    ? <PluginIcon icon={plugin.icon} size={14} />
                    : <span className="text-zinc-400 text-xs">▸</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-zinc-800 truncate">{node.label}</span>
                    {step.status === 'running'
                      ? <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                      : <span className={`text-[10px] font-mono shrink-0 ${STATUS_COLOR[step.status]}`}>{STATUS_ICON[step.status]}</span>
                    }
                  </div>
                  {plugin && (
                    <span className="text-[9px] text-zinc-400 font-mono">{plugin.name} · {node.action}</span>
                  )}
                </div>
              </div>

              {/* Inputs */}
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

                    if (paramVal) {
                      const paramStr = typeof paramVal === 'string' ? paramVal : String(paramVal)
                      const resolved = substituteVars(paramStr, templateVarValues)
                      const hasVar = /\{\{/.test(paramStr)
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className={`text-[10px] font-mono border rounded px-2 py-0.5 truncate max-w-[140px] ${
                            hasVar && resolved !== paramVal ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                          }`}>{resolved}</span>
                          <CopyButton value={resolved} />
                        </div>
                      )
                    }

                    if (isFromUpstream) {
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          {actualUpstreamVal ? (
                            <><DataValue value={actualUpstreamVal} inline /><CopyButton value={actualUpstreamVal} /></>
                          ) : (
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 italic">
                              auto · from upstream ↑
                            </span>
                          )}
                        </div>
                      )
                    }

                    if (userVal && step.status !== 'pending' && step.status !== 'waiting') {
                      return (
                        <div key={field.key} className="group flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate">{field.label ?? field.key}</span>
                          <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 truncate max-w-[140px]">{userVal}</span>
                          <CopyButton value={userVal} />
                        </div>
                      )
                    }

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
                            className="w-full bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 placeholder-zinc-300 outline-none focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-[border-color,box-shadow] duration-150"
                          />
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              )}

              {/* Outputs */}
              {outputKeys.length > 0 && step.status !== 'pending' && (
                <div className="px-3 pb-2 space-y-1.5">
                  <div className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Outputs</div>
                  {outputKeys.map((key) => {
                    const val = step.result?.outputs?.[key]
                    return (
                      <div key={key} className="group flex items-start gap-2">
                        <span className="text-[10px] font-mono text-zinc-400 w-24 shrink-0 truncate pt-0.5">{key}</span>
                        {val ? (
                          <><div className="flex-1 min-w-0"><DataValue value={val} /></div><CopyButton value={val} /></>
                        ) : (
                          <span className="text-[10px] text-zinc-300 italic">{step.status === 'running' ? '…' : '—'}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Result message */}
              {step.result?.display && (
                <div className="mx-3 mb-2 text-[11px] text-zinc-600 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100 leading-relaxed">
                  {step.result.display}
                </div>
              )}
              {step.result?.error && (
                <div className="mx-3 mb-2 text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                  {step.result.error}
                </div>
              )}
              {step.result?.txHash && (
                <a href={step.result.link ?? `https://etherscan.io/tx/${step.result.txHash}`}
                  target="_blank" rel="noreferrer"
                  className="mx-3 mb-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors duration-100">
                  View transaction ↗
                </a>
              )}

              {/* Approval */}
              {step.status === 'waiting' && (
                <div className="mx-3 mb-3 flex gap-2">
                  <button onClick={() => handleApprove(i)}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white text-xs font-semibold rounded-lg transition-[transform,background-color] duration-150">
                    Approve & Continue
                  </button>
                  <button onClick={onClose}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 active:scale-[0.97] text-zinc-500 text-xs rounded-lg transition-[transform,background-color] duration-150">
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
              <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Data Store</span>
              <span className="text-[9px] bg-zinc-100 border border-zinc-200 rounded-full px-2 py-0.5 text-zinc-500 font-mono">
                {totalOutputCount} value{totalOutputCount !== 1 ? 's' : ''}
              </span>
            </div>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`text-zinc-400 transition-transform duration-150 ${dataStoreOpen ? 'rotate-180' : ''}`}>
              <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {dataStoreOpen && (
            <div className="px-4 pb-3 space-y-3 max-h-72 overflow-y-auto">
              {flow.nodes
                .filter((n) => nodeOutputs[n.id] && Object.keys(nodeOutputs[n.id]!).length > 0)
                .map((node) => {
                  const plugin = getPlugin(node.plugin)
                  const outputs = nodeOutputs[node.id]!
                  return (
                    <div key={node.id}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {plugin ? <PluginIcon icon={plugin.icon} size={12} /> : <span className="text-xs">▸</span>}
                        <span className="text-[10px] font-semibold text-zinc-600">{node.label}</span>
                      </div>
                      <div className="space-y-1.5 pl-4">
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
      <div className="px-4 py-4 border-t border-zinc-100 shrink-0">
        {isDone ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm text-emerald-600 font-semibold">Flow complete</span>
          </div>
        ) : !hasStarted ? (
          <button
            onClick={startExecution}
            disabled={running}
            className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-[transform,background-color] duration-150 flex items-center justify-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
            Execute Flow
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-zinc-400">
            {running
              ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />Executing…</>
              : 'Waiting for approval'
            }
          </div>
        )}
      </div>
    </div>
  )
}
