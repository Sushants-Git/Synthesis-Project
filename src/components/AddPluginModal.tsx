import { useState, useEffect, useMemo } from 'react'
import { saveVarDefaults, loadVarDefaults, type PluginManifest } from '../plugins/registry.ts'

interface Props {
  onAdd: (manifest: PluginManifest) => void
  onClose: () => void
  /** When set, the modal opens in edit mode pre-populated with the existing manifest */
  initialManifest?: PluginManifest
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATE_GOOGLE_SHEETS: PluginManifest = {
  id: 'google-sheets',
  name: 'Google Sheets',
  description: 'Read wallet addresses from a Google Sheet for batch operations',
  aiDescription:
    'Fetch a list of wallet addresses from a Google Sheets column. Outputs a JSON array of addresses under the key "wallets" so downstream nodes like metamask:batch_send can iterate over them.',
  icon: '📊',
  color: 'green',
  executeUrl: 'https://your-worker.workers.dev?key={{api_key}}',
  capabilities: [
    {
      action: 'fetch_wallets',
      label: 'Fetch Wallet List',
      description: 'Read a column of wallet addresses from a Google Sheet',
      inputs: [
        { key: 'sheet_id', label: 'Sheet ID', type: 'string', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', required: true },
        { key: 'range', label: 'Column Range (A1 notation)', type: 'string', placeholder: 'Sheet1!A2:A', required: true },
        { key: 'api_key', label: 'Google Sheets API Key', type: 'string', placeholder: 'AIzaSy...', required: true },
      ],
      outputs: [
        { key: 'wallets', label: 'Wallet Addresses', type: 'string[]' },
        { key: 'count', label: 'Count', type: 'string' },
      ],
      requiresApproval: false,
    },
  ],
}

const TEMPLATE_HTTP_WEBHOOK: PluginManifest = {
  id: 'my-api',
  name: 'My API',
  description: 'Call a custom HTTP endpoint and pass the result downstream',
  aiDescription:
    'Call a custom REST API endpoint. The server receives {action, params, context} and returns a PluginResult. Use this as a generic data source or computation node.',
  icon: '🔌',
  color: 'blue',
  executeUrl: 'https://your-api.com/canvii-execute',
  capabilities: [
    {
      action: 'call',
      label: 'Call Endpoint',
      description: 'POST to your API and forward the result',
      inputs: [
        { key: 'input', label: 'Input', type: 'string', placeholder: 'Any value to pass to your endpoint', required: false },
      ],
      outputs: [{ key: 'result', label: 'Result', type: 'string' }],
      requiresApproval: false,
    },
  ],
}

const TEMPLATE_BLANK: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'What this plugin does',
  aiDescription: 'Describe this plugin for the AI so it knows when to use it in flows',
  icon: '⚡',
  color: 'violet',
  executeUrl: 'https://your-server.com/execute',
  capabilities: [
    {
      action: 'my_action',
      label: 'My Action',
      description: 'What this action does',
      inputs: [
        { key: 'input', label: 'Input', type: 'string', placeholder: 'Enter a value', required: true },
      ],
      outputs: [{ key: 'result', label: 'Result', type: 'string' }],
      requiresApproval: false,
    },
  ],
}

// ─── Server code examples ────────────────────────────────────────────────────

const SERVER_CODE: Record<string, string> = {
  'google-sheets': `// Cloudflare Worker  ·  deploy with \`wrangler deploy\`
// This handles the POST from canvii and calls the Google Sheets API.

export default {
  async fetch(req: Request): Promise<Response> {
    // Required: return CORS headers so the browser can POST here
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    const { action, params } = await req.json()

    if (action === 'fetch_wallets') {
      const url =
        \`https://sheets.googleapis.com/v4/spreadsheets/\` +
        \`\${params.sheet_id}/values/\${params.range}?key=\${params.api_key}\`

      const res = await fetch(url)
      if (!res.ok) {
        return Response.json({ status: 'error', error: \`Sheets API \${res.status}\` })
      }

      const { values = [] } = await res.json()
      const wallets = (values as string[][]).flat().filter(Boolean)

      return Response.json(
        {
          status: 'done',
          outputs: {
            wallets: JSON.stringify(wallets),   // consumed by metamask:batch_send
            count: String(wallets.length),
          },
          display: \`Fetched \${wallets.length} wallet addresses\`,
        },
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    return Response.json(
      { status: 'error', error: \`Unknown action: \${action}\` },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  },
}`,

  'my-api': `// Any HTTP server works — here's a minimal Node.js example.
// Your server must return CORS headers so the browser can POST.

import { createServer } from 'http'

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.end()

  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const { action, params, context } = JSON.parse(body)

    // Your logic here
    const result = { status: 'done', outputs: { result: 'hello from server' }, display: 'Done' }

    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  })
}).listen(3000)`,

  'my-plugin': `// canvii plugin server — receive POST { action, params, context }
// Return a PluginResult: { status, outputs?, display?, error?, txHash?, link? }
//
// REQUIRED: your server must send CORS headers:
//   Access-Control-Allow-Origin: *
//
// Deploy anywhere — Cloudflare Workers, Vercel, Railway, local dev, etc.
//
// PluginResult shape:
// {
//   status: 'done' | 'error' | 'waiting',
//   outputs?: Record<string, string>,   ← keys available to downstream nodes
//   display?: string,                   ← shown in the executor UI
//   error?: string,                     ← shown on status 'error'
//   txHash?: string,                    ← renders an Etherscan link
//   link?: string,                      ← custom explorer link
// }`,
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateManifest(json: string): { ok: true; manifest: PluginManifest } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${(e as SyntaxError).message}` }
  }

  const m = parsed as Partial<PluginManifest>
  if (!m.id?.trim()) return { ok: false, error: '"id" is required' }
  if (!m.name?.trim()) return { ok: false, error: '"name" is required' }
  if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
    return { ok: false, error: '"capabilities" must be a non-empty array' }
  }
  return { ok: true, manifest: m as PluginManifest }
}

// ─── Component ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  { key: 'google-sheets', label: 'Google Sheets', icon: '📊', tagline: 'Fetch wallets → batch send', manifest: TEMPLATE_GOOGLE_SHEETS },
  { key: 'my-api', label: 'HTTP Webhook', icon: '🔌', tagline: 'Call any REST endpoint', manifest: TEMPLATE_HTTP_WEBHOOK },
  { key: 'my-plugin', label: 'Custom', icon: '⚡', tagline: 'Start from scratch', manifest: TEMPLATE_BLANK },
]

export default function AddPluginModal({ onAdd, onClose, initialManifest }: Props) {
  const isEditMode = !!initialManifest
  const [selectedTemplate, setSelectedTemplate] = useState('google-sheets')
  const [jsonValue, setJsonValue] = useState(
    initialManifest
      ? JSON.stringify(initialManifest, null, 2)
      : JSON.stringify(TEMPLATE_GOOGLE_SHEETS, null, 2),
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showServerCode, setShowServerCode] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Live-detect {{variable}} placeholders in the JSON
  const detectedVars = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const [, key] of jsonValue.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!seen.has(key)) { seen.add(key); order.push(key) }
    }
    return order
  }, [jsonValue])

  // Variable values — pre-filled from stored defaults
  const [varValues, setVarValues] = useState<Record<string, string>>(() => loadVarDefaults())

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const selectTemplate = (key: string) => {
    const t = TEMPLATES.find((t) => t.key === key)
    if (!t) return
    setSelectedTemplate(key)
    setJsonValue(JSON.stringify(t.manifest, null, 2))
    setValidationError(null)
    setShowServerCode(false)
  }

  const handleJsonChange = (val: string) => {
    setJsonValue(val)
    setValidationError(null)
  }

  const handleAdd = () => {
    const result = validateManifest(jsonValue)
    if (!result.ok) {
      setValidationError(result.error)
      return
    }
    // Persist any filled var values so the executor can pre-fill them
    const nonEmpty = Object.fromEntries(
      Object.entries(varValues).filter(([, v]) => v.trim()),
    )
    if (Object.keys(nonEmpty).length > 0) saveVarDefaults(nonEmpty)
    onAdd(result.manifest)
  }

  // Live preview — best-effort parse
  const preview = (() => {
    try {
      const m = JSON.parse(jsonValue) as Partial<PluginManifest>
      if (m.name && m.icon) return m
    } catch { /* ignore */ }
    return null
  })()

  const serverCode = SERVER_CODE[selectedTemplate] ?? SERVER_CODE['my-plugin']!

  const copyServerCode = () => {
    void navigator.clipboard.writeText(serverCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
        onPointerDown={onClose}
      />

      {/* Panel */}
      <div
        className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none"
      >
        <div
          className="pointer-events-auto w-[680px] max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl shadow-zinc-300/60 border border-zinc-200 animate-float-in overflow-hidden"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                {isEditMode ? `Edit Plugin — ${initialManifest?.name}` : 'Add Custom Plugin'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isEditMode
                  ? 'Edit the JSON manifest and save to update the plugin.'
                  : 'Define a plugin via JSON manifest. Your server handles execution.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 text-sm leading-none transition-colors active:scale-[0.9]"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Template picker — hidden in edit mode */}
            {!isEditMode && (
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium mb-2">Template</div>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => selectTemplate(t.key)}
                      className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl border text-left transition-[background-color,border-color,box-shadow] duration-150 active:scale-[0.98] ${
                        selectedTemplate === t.key
                          ? 'border-blue-300 bg-blue-50 shadow-[0_0_0_3px_rgba(59,130,246,0.10)]'
                          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      <span className="text-xl leading-none">{t.icon}</span>
                      <span className={`text-xs font-semibold ${selectedTemplate === t.key ? 'text-blue-700' : 'text-zinc-700'}`}>{t.label}</span>
                      <span className="text-[10px] text-zinc-400 leading-snug">{t.tagline}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live template variable fields */}
            {detectedVars.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/60 rounded-xl px-4 py-3 space-y-2 animate-fade-up">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest">Template variables</span>
                  <span className="text-[9px] text-amber-500 italic">detected from {'{{...}}'} in your manifest</span>
                </div>
                {detectedVars.map((key) => {
                  const isSensitive = /key|secret|token|password|auth/i.test(key)
                  return (
                    <div key={key} className="flex items-center gap-2.5">
                      <code className="text-[10px] font-mono text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
                        {`{{${key}}}`}
                      </code>
                      <input
                        type={isSensitive ? 'password' : 'text'}
                        placeholder={`Enter value for ${key}`}
                        value={varValues[key] ?? ''}
                        onChange={(e) => setVarValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="flex-1 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 outline-none focus:border-amber-400 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.10)] transition-[border-color,box-shadow] duration-150"
                      />
                    </div>
                  )
                })}
                <p className="text-[9px] text-amber-500 leading-snug pt-0.5">
                  Saved as defaults — pre-filled every time this plugin runs in the executor.
                </p>
              </div>
            )}

            {/* JSON editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Plugin Manifest (JSON)</div>
                {preview && (
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span>{preview.icon}</span>
                    <span className="font-medium text-zinc-700">{preview.name}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{(preview.capabilities ?? []).length} capability{(preview.capabilities ?? []).length !== 1 ? 'ies' : 'y'}</span>
                  </div>
                )}
              </div>
              <textarea
                className={`w-full h-64 bg-zinc-50 border rounded-xl px-4 py-3 font-mono text-[11px] text-zinc-800 placeholder-zinc-400 outline-none resize-none transition-[border-color,box-shadow] duration-150 leading-relaxed ${
                  validationError
                    ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                    : 'border-zinc-200 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.08)]'
                }`}
                value={jsonValue}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
              />
              {validationError && (
                <div className="mt-1.5 text-[11px] text-red-500 flex items-center gap-1.5 animate-fade-up">
                  <span>✕</span>
                  <span>{validationError}</span>
                </div>
              )}
            </div>

            {/* Server code */}
            <div className="border border-zinc-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowServerCode((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 transition-colors duration-100"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Server setup</span>
                  <span className="text-[9px] text-zinc-400 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-full">
                    {selectedTemplate === 'google-sheets' ? 'Cloudflare Worker' : 'Node.js / any server'}
                  </span>
                </div>
                <span
                  className="text-zinc-400 text-xs transition-transform duration-200"
                  style={{ transform: showServerCode ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ›
                </span>
              </button>

              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: showServerCode ? '1fr' : '0fr',
                  transition: 'grid-template-rows 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
                }}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-zinc-100">
                    <div className="relative bg-zinc-950 rounded-b-xl">
                      <button
                        onClick={copyServerCode}
                        className="absolute top-3 right-3 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors duration-100 font-mono"
                      >
                        {copiedCode ? '✓ copied' : 'copy'}
                      </button>
                      <pre className="px-4 py-4 text-[10.5px] text-zinc-300 font-mono leading-relaxed overflow-x-auto whitespace-pre">
                        {serverCode}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 space-y-1.5">
              <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">How it works</div>
              <div className="space-y-1 text-[11px] text-zinc-500 leading-snug">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0 mt-[1px]">1</span>
                  <span>canvii POSTs <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">{'{ action, params, context }'}</code> to your <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">executeUrl</code></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0 mt-[1px]">2</span>
                  <span>Your server runs the logic (Sheets API, database, contract call — anything)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0 mt-[1px]">3</span>
                  <span>Return <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">{'{ status, outputs, display }'}</code> — <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">outputs</code> keys become available to downstream nodes</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 shrink-0 mt-[1px]">4</span>
                  <span>Your server must include <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">Access-Control-Allow-Origin: *</code> in every response</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 shrink-0 mt-[1px]">✦</span>
                  <span>Use <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">{'{{variable_name}}'}</code> anywhere in <code className="bg-white border border-zinc-200 rounded px-1 text-[10px] font-mono text-zinc-700">executeUrl</code> or param values — they become input fields at the top of the executor</span>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700 transition-colors duration-100"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.97] text-white text-xs font-semibold rounded-lg shadow-sm shadow-blue-200 transition-[transform,background-color] duration-150"
            >
              {isEditMode ? 'Save Changes →' : 'Add Plugin →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
