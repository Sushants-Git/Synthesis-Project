import { MetaMaskPlugin } from './metamask.ts'
import { ENSPlugin } from './ens.ts'
import { StatusNetworkPlugin } from './statusNetwork.ts'
import { SelfPlugin } from './self.ts'
import { TwitterPlugin } from './twitter.ts'
import { GoogleSheetsPlugin } from './googleSheets.ts'
import {
  loadSoftPlugins as _loadSoftPlugins,
  buildSoftPlugin,
  saveSoftPlugin,
  deleteSoftPlugin,
} from './softPlugin.ts'
import type { Plugin, PluginManifest, ExecutionContext, PluginCapability, PluginResult, InputDef, OutputDef, IOType } from './types.ts'
import type { SoftPluginDef } from './softPlugin.ts'
export type { SoftPluginDef }

// Re-export types so plugin authors only need to import from one place
export type { Plugin, PluginManifest, ExecutionContext, PluginCapability, PluginResult, InputDef, OutputDef, IOType }

const STORAGE_KEY = 'canvii_custom_plugins'

// Hard plugins: built-in, code-defined
const HARD_PLUGINS: Record<string, Plugin> = {
  metamask: { ...MetaMaskPlugin, category: 'hard' },
  ens: { ...ENSPlugin, category: 'hard' },
  status: { ...StatusNetworkPlugin, category: 'hard' },
  self: { ...SelfPlugin, category: 'hard' },
  twitter: { ...TwitterPlugin, category: 'hard' },
  sheets: { ...GoogleSheetsPlugin, category: 'hard' },
}

const PLUGINS: Record<string, Plugin> = { ...HARD_PLUGINS }

/** Register a plugin instance directly. For built-in plugins or code-defined plugins. */
export function registerPlugin(plugin: Plugin): void {
  PLUGINS[plugin.id] = plugin
}

/**
 * Convert a JSON manifest into a live Plugin.
 * If `executeUrl` is set, execute() POSTs to that URL.
 * Otherwise returns a visual-only stub.
 */
export function loadPluginManifest(manifest: PluginManifest): Plugin {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    aiDescription: manifest.aiDescription,
    icon: manifest.icon,
    color: manifest.color,
    prizeTrack: manifest.prizeTrack,
    executeUrl: manifest.executeUrl,
    capabilities: manifest.capabilities,

    async execute(action: string, inputs: Record<string, string | string[]>, ctx: ExecutionContext): Promise<PluginResult> {
      if (!manifest.executeUrl) {
        return { status: 'done', display: `[${manifest.name}] visual-only — no executeUrl configured` }
      }

      const vars = ctx.templateVars ?? {}
      const url = substituteVars(manifest.executeUrl, vars)
      const resolvedInputs: Record<string, string | string[]> = Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map((s) => substituteVars(s, vars)) : substituteVars(v, vars),
        ]),
      )

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, inputs: resolvedInputs, context: ctx }),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          return { status: 'error', error: `HTTP ${resp.status}${text ? ': ' + text : ''}` }
        }

        return (await resp.json()) as PluginResult
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          return { status: 'error', error: 'Request timed out (15s)' }
        }
        return { status: 'error', error: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

/** Register a manifest-based plugin and persist it to localStorage. */
export function registerPluginFromManifest(manifest: PluginManifest): void {
  PLUGINS[manifest.id] = loadPluginManifest(manifest)
  persistManifest(manifest)
}

/** Remove a custom plugin by id (from registry + localStorage). */
export function removeCustomPlugin(id: string): void {
  delete PLUGINS[id]
  const saved = loadSavedManifests().filter((m) => m.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
}

/** Returns the current list of all registered plugins (computed live). */
export function getPluginList(): Plugin[] {
  return Object.values(PLUGINS)
}

/** Returns the saved manifests from localStorage (custom plugins only). */
export function loadSavedManifests(): PluginManifest[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PluginManifest[]
  } catch {
    return []
  }
}

/** Load and register all custom plugins persisted in localStorage. Call once on startup. */
export function loadPersistedPlugins(): void {
  for (const manifest of loadSavedManifests()) {
    PLUGINS[manifest.id] = loadPluginManifest(manifest)
  }
  for (const def of _loadSoftPlugins()) {
    PLUGINS[def.id] = buildSoftPlugin(def)
  }
}

/** Returns the list of soft plugin defs from storage (for the sidebar to render). */
export { _loadSoftPlugins as loadSoftPluginDefs }

/** Register a soft plugin (save to storage + live registry). */
export function registerSoftPlugin(def: SoftPluginDef): void {
  saveSoftPlugin(def)
  PLUGINS[def.id] = buildSoftPlugin(def)
}

/** Remove a soft plugin by id. */
export function removeSoftPluginById(id: string): void {
  deleteSoftPlugin(id)
  delete PLUGINS[id]
}

function persistManifest(manifest: PluginManifest): void {
  const existing = loadSavedManifests().filter((m) => m.id !== manifest.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, manifest]))
}

/**
 * Convenience factory for code-defined plugins.
 * Defaults `execute` to a no-op — useful for visual/placeholder plugins.
 */
export function createPlugin(
  def: Omit<Plugin, 'execute'> & { execute?: Plugin['execute'] },
): Plugin {
  return {
    execute: async (_action, _params, _ctx) => ({ status: 'done', display: 'Done' }),
    ...def,
  }
}

const VAR_DEFAULTS_KEY = 'canvii_var_defaults'

/** Persist template variable values so the modal and executor can pre-fill them. */
export function saveVarDefaults(vars: Record<string, string>): void {
  const current = loadVarDefaults()
  localStorage.setItem(VAR_DEFAULTS_KEY, JSON.stringify({ ...current, ...vars }))
}

/** Load stored template variable defaults (merged across all plugins). */
export function loadVarDefaults(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VAR_DEFAULTS_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Replace all {{variable}} placeholders in a string with values from the map.
 * Unmatched placeholders are left as-is so missing vars are obvious.
 */
export function substituteVars(str: unknown, vars: Record<string, string>): string {
  if (typeof str !== 'string') return str === null || str === undefined ? '' : String(str)
  return str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`)
}

/** Build the plugin descriptions block injected into the AI system prompt */
export function buildPluginContext(): string {
  const lines: string[] = []
  for (const p of getPluginList()) {
    const meta = p.prizeTrack ? ` | Prize: ${p.prizeTrack}` : ''
    const tag = p.category === 'soft' ? ' [user-built]' : ''
    lines.push(`- ${p.id} (${p.name}${meta}${tag}): ${p.aiDescription}`)
    for (const cap of p.capabilities) {
      const inStr = cap.inputs.map((i) => {
        const t = i.type === 'string[]' ? '[]' : ''
        return `${i.key}${t}${i.required ? '*' : '?'}`
      }).join(', ')
      const outStr = cap.outputs.length
        ? cap.outputs.map((o) => `${o.key}${o.type === 'string[]' ? '[]' : ''}`).join(', ')
        : 'none'
      lines.push(`  · ${p.id}:${cap.action}(${inStr}) → [${outStr}]`)
    }
  }
  return lines.join('\n')
}

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS[id]
}
