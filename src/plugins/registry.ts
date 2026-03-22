import { MetaMaskPlugin } from './metamask.ts'
import { ENSPlugin } from './ens.ts'
import { StatusNetworkPlugin } from './statusNetwork.ts'
import { SelfPlugin } from './self.ts'
import { TwitterPlugin } from './twitter.ts'
import type { Plugin, PluginManifest, ExecutionContext, PluginCapability, PluginResult, ParamDef } from './types.ts'

// Re-export types so plugin authors only need to import from one place
export type { Plugin, PluginManifest, ExecutionContext, PluginCapability, PluginResult, ParamDef }

const STORAGE_KEY = 'flowtx_custom_plugins'

const PLUGINS: Record<string, Plugin> = {
  metamask: MetaMaskPlugin,
  ens: ENSPlugin,
  status: StatusNetworkPlugin,
  self: SelfPlugin,
  twitter: TwitterPlugin,
}

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
    capabilities: manifest.capabilities,

    async execute(action: string, params: Record<string, string>, ctx: ExecutionContext): Promise<PluginResult> {
      if (!manifest.executeUrl) {
        return { status: 'done', display: `[${manifest.name}] visual-only — no executeUrl configured` }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)

        const resp = await fetch(manifest.executeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, params, context: ctx }),
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

/** Build the plugin descriptions block injected into the AI system prompt */
export function buildPluginContext(): string {
  return getPluginList()
    .map(
      (p) =>
        `- ${p.id} (${p.name}${p.prizeTrack ? ` | Prize: ${p.prizeTrack}` : ''}): ${p.aiDescription}`,
    )
    .join('\n')
}

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS[id]
}
