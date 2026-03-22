import { MetaMaskPlugin } from './metamask.ts'
import { ENSPlugin } from './ens.ts'
import { StatusNetworkPlugin } from './statusNetwork.ts'
import { SelfPlugin } from './self.ts'
import { TwitterPlugin } from './twitter.ts'
import type { Plugin, ExecutionContext, PluginCapability, PluginResult, ParamDef } from './types.ts'

// Re-export types so plugin authors only need to import from one place
export type { Plugin, ExecutionContext, PluginCapability, PluginResult, ParamDef }

const PLUGINS: Record<string, Plugin> = {
  metamask: MetaMaskPlugin,
  ens: ENSPlugin,
  status: StatusNetworkPlugin,
  self: SelfPlugin,
  twitter: TwitterPlugin,
}

/** Register a custom plugin at runtime. Safe to call before mounting the app. */
export function registerPlugin(plugin: Plugin): void {
  PLUGINS[plugin.id] = plugin
}

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS[id]
}

/** Returns the current list of all registered plugins (computed live). */
export function getPluginList(): Plugin[] {
  return Object.values(PLUGINS)
}

/**
 * Convenience factory for building a plugin without boilerplate.
 * Defaults `execute` to a no-op "done" — useful for visual/placeholder plugins.
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
