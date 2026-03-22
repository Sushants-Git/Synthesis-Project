import { useState, useCallback } from 'react'
import type { SoftPluginDef, ApiStepDef, OutputMapping, SoftPluginInput } from '../plugins/softPlugin.ts'
import { getValueAtPath } from '../plugins/softPlugin.ts'

// ── JSON Inspector ────────────────────────────────────────────────────────────

function JsonNode({
  value,
  path,
  depth,
  onMap,
}: {
  value: unknown
  path: string
  depth: number
  onMap: (path: string, suggestedKey: string) => void
}) {
  const [collapsed, setCollapsed] = useState(depth > 1)

  if (value === null || value === undefined) {
    return <span className="text-zinc-400 text-[10px] font-mono italic">null</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-zinc-400 text-[10px] font-mono">[]</span>
    const preview = `[${value.length}]`
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-zinc-500 text-[10px] font-mono hover:text-zinc-700"
        >
          {collapsed ? `${preview} ▸` : `▾`}
        </button>
        {!collapsed && (
          <div className="pl-3 border-l border-zinc-200 mt-0.5">
            {value.slice(0, 30).map((item, i) => (
              <div key={i} className="flex items-start gap-1 py-[1px]">
                <span className="text-zinc-400 text-[10px] font-mono shrink-0 mt-[1px]">[{i}]</span>
                <JsonNode value={item} path={`${path}.${i}`} depth={depth + 1} onMap={onMap} />
              </div>
            ))}
            {value.length > 30 && (
              <span className="text-zinc-400 text-[10px]">…+{value.length - 30} more</span>
            )}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-zinc-400 text-[10px] font-mono">{'{}'}</span>
    const preview = `{${entries
      .slice(0, 2)
      .map(([k]) => k)
      .join(', ')}${entries.length > 2 ? '…' : ''}}`
    return (
      <span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-zinc-500 text-[10px] font-mono hover:text-zinc-700"
        >
          {collapsed ? `${preview} ▸` : `▾`}
        </button>
        {!collapsed && (
          <div className="pl-3 border-l border-zinc-200 mt-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-start gap-1 py-[1px]">
                <span className="text-blue-600 text-[10px] font-mono shrink-0 mt-[1px]">{k}:</span>
                <JsonNode
                  value={v}
                  path={path ? `${path}.${k}` : k}
                  depth={depth + 1}
                  onMap={onMap}
                />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  // Leaf — clickable to map as output
  const suggestedKey = path.split('.').filter((p) => isNaN(Number(p))).pop() ?? 'value'
  const displayVal =
    typeof value === 'string'
      ? `"${String(value).slice(0, 80)}${String(value).length > 80 ? '…' : ''}"`
      : String(value)

  return (
    <span className="inline-flex items-center gap-1 group/leaf">
      <span
        className={`text-[10px] font-mono ${
          typeof value === 'string' ? 'text-emerald-700' : 'text-orange-600'
        }`}
      >
        {displayVal}
      </span>
      <button
        onClick={() => onMap(path, suggestedKey)}
        className="opacity-0 group-hover/leaf:opacity-100 text-[9px] text-blue-500 hover:text-blue-700 bg-blue-50 border border-blue-100 rounded px-1 leading-4 transition-opacity duration-100 shrink-0"
        title={`Add "${path}" as an output`}
      >
        +map
      </button>
    </span>
  )
}

// ── Step Editor ───────────────────────────────────────────────────────────────

const COLORS = ['blue', 'orange', 'green', 'red', 'violet', 'yellow']
const ICONS = ['🔌', '🌐', '📡', '🔗', '⚡', '🛰', '🔧', '📊', '💡', '🔑', '🧩', '🚀']

function StepEditor({
  step,
  availableVars,
  onUpdate,
}: {
  step: ApiStepDef
  availableVars: string[]
  onUpdate: (updated: ApiStepDef) => void
}) {
  const [testing, setTesting] = useState(false)
  const [response, setResponse] = useState<unknown | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'headers' | 'body'>('headers')
  const [pendingMap, setPendingMap] = useState<{ path: string; key: string } | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setResponse(null)
    setTestError(null)
    try {
      const headers: Record<string, string> = {}
      for (const h of step.headers) {
        if (h.key.trim()) headers[h.key] = h.value
      }
      const resp = await fetch(step.url, {
        method: step.method,
        headers: step.method !== 'GET' ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: step.method !== 'GET' && step.body.trim() ? step.body : undefined,
      })
      const text = await resp.text()
      try {
        setResponse(JSON.parse(text))
      } catch {
        setResponse(text)
      }
      if (!resp.ok) setTestError(`HTTP ${resp.status}`)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e))
    } finally {
      setTesting(false)
    }
  }

  const handleMapPath = useCallback(
    (path: string, suggestedKey: string) => {
      // Check if already mapped
      const exists = step.outputMappings.find((m) => m.path === path)
      if (exists) return
      // If key conflicts, suffix with number
      let key = suggestedKey
      let n = 1
      while (step.outputMappings.find((m) => m.key === key)) {
        key = `${suggestedKey}${n++}`
      }
      setPendingMap({ path, key })
    },
    [step.outputMappings],
  )

  const confirmMap = () => {
    if (!pendingMap) return
    const valueAtPath = response !== null ? getValueAtPath(response, pendingMap.path) : undefined
    const label = pendingMap.key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())

    onUpdate({
      ...step,
      outputMappings: [
        ...step.outputMappings,
        { path: pendingMap.path, key: pendingMap.key, label, previewValue: String(valueAtPath ?? '') },
      ] as OutputMapping[],
    })
    setPendingMap(null)
  }

  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    const headers = [...step.headers]
    headers[i] = { ...headers[i], [field]: val }
    onUpdate({ ...step, headers })
  }

  const addHeader = () => {
    onUpdate({ ...step, headers: [...step.headers, { key: '', value: '' }] })
  }

  const removeHeader = (i: number) => {
    onUpdate({ ...step, headers: step.headers.filter((_, idx) => idx !== i) })
  }

  const removeMapping = (path: string) => {
    onUpdate({ ...step, outputMappings: step.outputMappings.filter((m) => m.path !== path) })
  }

  const updateMappingKey = (path: string, key: string) => {
    onUpdate({
      ...step,
      outputMappings: step.outputMappings.map((m) => (m.path === path ? { ...m, key } : m)),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Step name */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
        <input
          className="flex-1 text-sm font-medium bg-transparent border-b border-transparent hover:border-zinc-200 focus:border-blue-400 outline-none text-zinc-900 pb-0.5 transition-colors"
          value={step.name}
          onChange={(e) => onUpdate({ ...step, name: e.target.value })}
          placeholder="Step name…"
        />
      </div>

      {/* URL + Method */}
      <div className="px-4 pb-3 flex items-center gap-2 shrink-0">
        <select
          value={step.method}
          onChange={(e) => onUpdate({ ...step, method: e.target.value as ApiStepDef['method'] })}
          className="text-[10px] font-medium border border-zinc-200 rounded-lg px-2 py-1.5 bg-zinc-50 text-zinc-700 outline-none cursor-pointer"
        >
          {(['GET', 'POST', 'PUT', 'DELETE'] as const).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          className="flex-1 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-[border-color,box-shadow] text-zinc-700 placeholder-zinc-400"
          placeholder="https://api.example.com/v1/endpoint"
          value={step.url}
          onChange={(e) => onUpdate({ ...step, url: e.target.value })}
        />
        <button
          onClick={handleTest}
          disabled={testing || !step.url.trim()}
          className="shrink-0 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-700 disabled:opacity-40 text-white text-[10px] font-medium rounded-lg transition-[background-color] duration-150 flex items-center gap-1.5 active:scale-[0.97]"
        >
          {testing ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Testing…</span>
            </>
          ) : (
            <>▶ Test</>
          )}
        </button>
      </div>

      {/* Available vars hint */}
      {availableVars.length > 0 && (
        <div className="px-4 pb-2 shrink-0">
          <div className="text-[9px] text-zinc-400 mb-1">Available variables (use as {'{{name}}'})</div>
          <div className="flex flex-wrap gap-1">
            {availableVars.map((v) => (
              <code key={v} className="text-[9px] bg-blue-50 text-blue-600 border border-blue-100 rounded px-1 leading-4">
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: Headers / Body */}
      <div className="px-4 flex gap-3 border-b border-zinc-100 shrink-0">
        {(['headers', 'body'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-[10px] font-medium pb-2 border-b-2 transition-[color,border-color] duration-150 capitalize ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {tab}
            {tab === 'headers' && step.headers.filter((h) => h.key).length > 0 && (
              <span className="ml-1 text-[8px] bg-zinc-200 text-zinc-500 rounded-full px-1">
                {step.headers.filter((h) => h.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-3 shrink-0">
        {activeTab === 'headers' && (
          <div className="space-y-1.5">
            {step.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="w-32 text-[10px] font-mono border border-zinc-200 rounded px-2 py-1 bg-zinc-50 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400"
                  placeholder="Header-Name"
                  value={h.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                />
                <input
                  className="flex-1 text-[10px] font-mono border border-zinc-200 rounded px-2 py-1 bg-zinc-50 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400"
                  placeholder="value or {{variable}}"
                  value={h.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="text-zinc-300 hover:text-red-400 text-sm transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addHeader}
              className="text-[10px] text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
            >
              + Add header
            </button>
          </div>
        )}

        {activeTab === 'body' && step.method !== 'GET' && (
          <textarea
            className="w-full text-[10px] font-mono bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400 resize-none"
            rows={4}
            placeholder={'{\n  "key": "{{variable}}"\n}'}
            value={step.body}
            onChange={(e) => onUpdate({ ...step, body: e.target.value })}
          />
        )}
        {activeTab === 'body' && step.method === 'GET' && (
          <p className="text-[10px] text-zinc-400">GET requests don't have a body.</p>
        )}
      </div>

      {/* Response + Mappings */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 min-h-0">
        {testError && (
          <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {testError}
          </div>
        )}

        {response !== null && (
          <div>
            <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium mb-1.5">
              Response — click a value to map it as an output
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 overflow-x-auto max-h-56 overflow-y-auto">
              {typeof response === 'string' ? (
                <pre className="text-[10px] font-mono text-zinc-700 whitespace-pre-wrap">{response}</pre>
              ) : (
                <JsonNode value={response} path="" depth={0} onMap={handleMapPath} />
              )}
            </div>
          </div>
        )}

        {/* Pending map confirmation */}
        {pendingMap && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-blue-700 font-medium truncate">
                Map <code className="font-mono">{pendingMap.path}</code>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-blue-500 shrink-0">Output key:</span>
                <input
                  autoFocus
                  className="flex-1 text-[10px] font-mono border border-blue-300 rounded px-2 py-0.5 bg-white outline-none focus:border-blue-500 text-zinc-800"
                  value={pendingMap.key}
                  onChange={(e) => setPendingMap({ ...pendingMap, key: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmMap()
                    if (e.key === 'Escape') setPendingMap(null)
                  }}
                  placeholder="output_key"
                />
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={confirmMap}
                disabled={!pendingMap.key.trim()}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[9px] font-medium rounded transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setPendingMap(null)}
                className="px-2 py-1 text-blue-500 hover:text-blue-700 text-[9px] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing mappings */}
        {step.outputMappings.length > 0 && (
          <div>
            <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium mb-1.5">
              Outputs from this step
            </div>
            <div className="space-y-1">
              {step.outputMappings.map((m) => (
                <div
                  key={m.path}
                  className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5"
                >
                  <code className="text-[9px] text-zinc-400 font-mono truncate flex-none max-w-[120px]">
                    {m.path}
                  </code>
                  <span className="text-zinc-300 text-[9px]">→</span>
                  <input
                    className="flex-1 text-[10px] font-mono border-0 outline-none bg-transparent text-zinc-700 min-w-0"
                    value={m.key}
                    onChange={(e) => updateMappingKey(m.path, e.target.value)}
                    placeholder="key"
                  />
                  <button
                    onClick={() => removeMapping(m.path)}
                    className="text-zinc-300 hover:text-red-400 text-xs transition-colors shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {response === null && !testError && (
          <p className="text-[10px] text-zinc-400 text-center py-4">
            Hit ▶ Test to inspect the response and map output fields
          </p>
        )}
      </div>
    </div>
  )
}

// ── Plugin Builder ────────────────────────────────────────────────────────────

interface Props {
  initial?: SoftPluginDef
  onSave: (def: SoftPluginDef) => void
  onClose: () => void
}

function makeStep(): ApiStepDef {
  return {
    id: Math.random().toString(36).slice(2, 8),
    name: 'API Call',
    url: '',
    method: 'GET',
    headers: [],
    body: '',
    outputMappings: [],
  }
}

export default function PluginBuilder({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🔌')
  const [color, setColor] = useState(initial?.color ?? 'blue')
  const [steps, setSteps] = useState<ApiStepDef[]>(initial?.steps ?? [makeStep()])
  const [inputs, setInputs] = useState<SoftPluginInput[]>(initial?.inputs ?? [])
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id ?? null)
  const [showIconPicker, setShowIconPicker] = useState(false)

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  const addStep = () => {
    const s = makeStep()
    setSteps((prev) => [...prev, s])
    setSelectedStepId(s.id)
  }

  const removeStep = (id: string) => {
    const next = steps.filter((s) => s.id !== id)
    setSteps(next)
    if (selectedStepId === id) setSelectedStepId(next[0]?.id ?? null)
  }

  const updateStep = (updated: ApiStepDef) => {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  const addInput = () => {
    setInputs((prev) => [
      ...prev,
      { key: '', label: '', placeholder: '', required: true },
    ])
  }

  const updateInput = (i: number, field: keyof SoftPluginInput, val: string | boolean) => {
    setInputs((prev) => prev.map((inp, idx) => (idx === i ? { ...inp, [field]: val } : inp)))
  }

  const removeInput = (i: number) => {
    setInputs((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Collect variables available to a given step index
  const getAvailableVars = (stepIndex: number): string[] => {
    const vars: string[] = []
    // Plugin-level inputs
    vars.push(...inputs.map((i) => i.key).filter(Boolean))
    // Outputs from all previous steps
    for (let i = 0; i < stepIndex; i++) {
      vars.push(...steps[i].outputMappings.map((m) => m.key))
    }
    return vars
  }

  const selectedStepIndex = steps.findIndex((s) => s.id === selectedStepId)

  const canSave = name.trim() && steps.length > 0

  const handleSave = () => {
    if (!canSave) return
    const id =
      initial?.id ??
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
        '_' +
        Math.random().toString(36).slice(2, 6)
    onSave({ id, name, description, icon, color, steps, inputs })
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl shadow-zinc-400/20 border border-zinc-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-float-in">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
            {/* Icon picker */}
            <div className="relative">
              <button
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="w-9 h-9 bg-zinc-100 hover:bg-zinc-200 rounded-xl flex items-center justify-center text-xl transition-colors active:scale-[0.95]"
              >
                {icon}
              </button>
              {showIconPicker && (
                <div className="absolute top-11 left-0 z-10 bg-white border border-zinc-200 rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => { setIcon(ic); setShowIconPicker(false) }}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <input
                className="w-full text-base font-semibold text-zinc-900 bg-transparent outline-none placeholder-zinc-300 border-b border-transparent focus:border-blue-400 pb-0.5 transition-colors"
                placeholder="Plugin name…"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="w-full text-xs text-zinc-500 bg-transparent outline-none placeholder-zinc-300 mt-0.5"
                placeholder="What does this plugin do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Color */}
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-[border-color] ${
                    color === c ? 'border-zinc-600' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: `var(--color-${c}-500, #6b7280)` }}
                  title={c}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 bg-blue-50 border border-blue-100 text-blue-500 rounded-full px-2 leading-5">
                Soft Plugin
              </span>
              <button
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm leading-none active:scale-[0.9]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body: steps list + step editor */}
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* Left: Steps list */}
            <div className="w-52 border-r border-zinc-100 flex flex-col shrink-0 overflow-y-auto">
              <div className="px-3 pt-3 pb-2">
                <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium mb-2">
                  API Steps
                </div>
                <div className="space-y-0.5">
                  {steps.map((s, i) => (
                    <div key={s.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => setSelectedStepId(s.id)}
                        className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-[background-color] duration-100 ${
                          selectedStepId === s.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-zinc-50 text-zinc-600'
                        }`}
                      >
                        <span className="text-[10px] text-zinc-400 shrink-0 font-mono w-4">{i + 1}</span>
                        <span className="text-[11px] font-medium truncate">{s.name || 'Unnamed'}</span>
                        {s.outputMappings.length > 0 && (
                          <span className="text-[8px] text-emerald-500 bg-emerald-50 rounded-full px-1 leading-4 shrink-0">
                            {s.outputMappings.length}
                          </span>
                        )}
                      </button>
                      {steps.length > 1 && (
                        <button
                          onClick={() => removeStep(s.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-400 text-xs transition-[opacity,color] shrink-0 px-1"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStep}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 border border-dashed border-zinc-300 hover:border-blue-400 hover:bg-blue-50/60 rounded-lg py-2 text-[10px] text-zinc-400 hover:text-blue-600 transition-[color,border-color,background-color] duration-150"
                >
                  <span>+</span>
                  <span>Add step</span>
                </button>
              </div>

              {/* Separator */}
              <div className="border-t border-zinc-100 mx-3 my-2" />

              {/* Plugin inputs */}
              <div className="px-3 pb-3 flex-1">
                <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium mb-2">
                  Plugin Inputs
                </div>
                <div className="space-y-2">
                  {inputs.map((inp, i) => (
                    <div key={i} className="group space-y-1">
                      <div className="flex items-center gap-1">
                        <input
                          className="flex-1 text-[10px] font-mono border border-zinc-200 rounded px-1.5 py-0.5 bg-zinc-50 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400"
                          placeholder="key"
                          value={inp.key}
                          onChange={(e) => updateInput(i, 'key', e.target.value)}
                        />
                        <button
                          onClick={() => removeInput(i)}
                          className="text-zinc-300 hover:text-red-400 text-xs transition-colors shrink-0"
                        >
                          ×
                        </button>
                      </div>
                      <input
                        className="w-full text-[10px] border border-zinc-200 rounded px-1.5 py-0.5 bg-zinc-50 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400"
                        placeholder="Label"
                        value={inp.label}
                        onChange={(e) => updateInput(i, 'label', e.target.value)}
                      />
                      <input
                        className="w-full text-[10px] border border-zinc-200 rounded px-1.5 py-0.5 bg-zinc-50 outline-none focus:border-blue-400 text-zinc-700 placeholder-zinc-400"
                        placeholder="Placeholder…"
                        value={inp.placeholder}
                        onChange={(e) => updateInput(i, 'placeholder', e.target.value)}
                      />
                    </div>
                  ))}
                  <button
                    onClick={addInput}
                    className="w-full flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    + Add input
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Step editor */}
            <div className="flex-1 overflow-hidden min-w-0">
              {selectedStep ? (
                <StepEditor
                  key={selectedStep.id}
                  step={selectedStep}
                  availableVars={getAvailableVars(selectedStepIndex)}
                  onUpdate={updateStep}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  Select a step to edit
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 shrink-0">
            <div className="text-[10px] text-zinc-400">
              {steps.length} step{steps.length !== 1 ? 's' : ''} ·{' '}
              {steps.flatMap((s) => s.outputMappings).length} outputs mapped
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-[background-color] duration-150 active:scale-[0.97]"
              >
                Save Plugin
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
