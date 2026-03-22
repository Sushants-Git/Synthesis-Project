import type { Plugin, PluginResult, ExecutionContext, IOType } from './types.ts'

export interface OutputMapping {
  path: string   // dot-notation path into response JSON: e.g. 'data.user.address'
  key: string    // output variable name used downstream: e.g. 'userAddress'
  label: string  // human label shown in executor
}

export interface ApiStepDef {
  id: string
  name: string
  url: string    // may contain {{varName}} placeholders
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers: Array<{ key: string; value: string }>
  body: string   // JSON string, may contain {{varName}} placeholders
  outputMappings: OutputMapping[]
  /**
   * Optional JS transform. Receives (response, vars) and must return
   * Record<string, unknown>. Runs after the fetch; returned keys become outputs.
   * If both transform and outputMappings are set, transform results take precedence.
   */
  transform?: string
}

export interface SoftPluginInput {
  key: string
  label: string
  placeholder: string
  required: boolean
  type?: IOType
}

export interface SoftPluginDef {
  id: string
  name: string
  description: string
  icon: string
  color: string
  steps: ApiStepDef[]
  inputs: SoftPluginInput[]
}

// ── Storage ──────────────────────────────────────────────────────────────────

const SOFT_PLUGINS_KEY = 'canvii_soft_plugins'

export function loadSoftPlugins(): SoftPluginDef[] {
  try {
    return JSON.parse(localStorage.getItem(SOFT_PLUGINS_KEY) ?? '[]') as SoftPluginDef[]
  } catch {
    return []
  }
}

export function saveSoftPlugin(def: SoftPluginDef): void {
  const existing = loadSoftPlugins().filter((d) => d.id !== def.id)
  localStorage.setItem(SOFT_PLUGINS_KEY, JSON.stringify([...existing, def]))
}

export function deleteSoftPlugin(id: string): void {
  const existing = loadSoftPlugins().filter((d) => d.id !== id)
  localStorage.setItem(SOFT_PLUGINS_KEY, JSON.stringify(existing))
}

// ── Path resolution ───────────────────────────────────────────────────────────

export function getValueAtPath(obj: unknown, path: string): unknown {
  // Filter empty segments so leading-dot paths like ".0.uuid" still resolve correctly
  const parts = path.split('.').filter(Boolean)
  let cur = obj
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return cur
}

function subst(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`)
}

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeSoftPlugin(
  def: SoftPluginDef,
  params: Record<string, string>,
  _ctx: ExecutionContext,
): Promise<PluginResult> {
  const vars: Record<string, string> = { ...params }
  const allOutputs: Record<string, string> = {}

  for (const step of def.steps) {
    const url = subst(step.url, vars)

    const resolvedHeaders: Record<string, string> = {}
    for (const h of step.headers) {
      if (h.key.trim()) resolvedHeaders[subst(h.key, vars)] = subst(h.value, vars)
    }

    let body: string | undefined
    if (step.method !== 'GET' && step.body.trim()) {
      body = subst(step.body, vars)
    }

    let resp: Response
    try {
      resp = await fetch(url, {
        method: step.method,
        headers: body ? { 'Content-Type': 'application/json', ...resolvedHeaders } : resolvedHeaders,
        body,
      })
    } catch (e) {
      return {
        status: 'error',
        error: `Step "${step.name}": ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    if (!resp.ok) {
      return { status: 'error', error: `Step "${step.name}": HTTP ${resp.status}` }
    }

    let data: unknown
    try {
      data = await resp.json()
    } catch {
      return { status: 'error', error: `Step "${step.name}": response is not JSON` }
    }

    // Run JS transform (takes precedence over click-mapped paths)
    if (step.transform?.trim()) {
      let result: Record<string, unknown>
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('response', 'vars', 'console', step.transform)
        // Pass real console so console.log works during execution
        result = (fn(data, { ...vars }, console) as Record<string, unknown>) ?? {}
      } catch (e) {
        return {
          status: 'error',
          error: `Step "${step.name}" transform: ${e instanceof Error ? e.message : String(e)}`,
        }
      }
      for (const [k, v] of Object.entries(result)) {
        const str = typeof v === 'string' ? v : JSON.stringify(v)
        vars[k] = str
        allOutputs[k] = str
      }
    } else {
      // Fallback: click-mapped dot-paths
      for (const mapping of step.outputMappings) {
        const value = getValueAtPath(data, mapping.path)
        if (value !== undefined) {
          const str = typeof value === 'string' ? value : JSON.stringify(value)
          vars[mapping.key] = str
          allOutputs[mapping.key] = str
        }
      }
    }
  }

  const entries = Object.entries(allOutputs)
  const display =
    entries.length
      ? entries
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
          .join(' · ')
      : 'Done'

  return { status: 'done', outputs: allOutputs, display }
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export function buildSoftPlugin(def: SoftPluginDef): Plugin {
  // Steps with a JS transform have dynamic outputs; steps without use click-mapped paths
  const outputKeys = def.steps.flatMap((s) =>
    s.transform?.trim() ? ['(dynamic — JS transform)'] : s.outputMappings.map((m) => m.key),
  )

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    aiDescription:
      `Custom API plugin: ${def.description}. ` +
      `Inputs: ${def.inputs.map((i) => i.key).join(', ') || 'none'}. ` +
      `Outputs: ${outputKeys.join(', ') || 'none'}.`,
    icon: def.icon,
    color: def.color,
    category: 'soft',
    capabilities: [
      {
        action: 'execute',
        label: def.name,
        description: def.description,
        inputs: def.inputs.map((i) => ({
          key: i.key,
          label: i.label,
          type: (i.type ?? 'string') as IOType,
          required: i.required,
          placeholder: i.placeholder,
        })),
        outputs: outputKeys.map((k) => ({ key: k, label: k, type: 'string' as IOType })),
      },
    ],
    execute: (_action, inputs, ctx) => executeSoftPlugin(
      def,
      // Coerce typed inputs to Record<string, string> for soft plugin's var substitution
      Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : v]),
      ),
      ctx,
    ),
  }
}
