import { MetaMaskPlugin } from './metamask.ts'
import { ENSPlugin } from './ens.ts'
import { StatusNetworkPlugin } from './statusNetwork.ts'
import { SelfPlugin } from './self.ts'
import { TwitterPlugin } from './twitter.ts'
import type { Plugin } from './types.ts'

export const PLUGINS: Record<string, Plugin> = {
  metamask: MetaMaskPlugin,
  ens: ENSPlugin,
  status: StatusNetworkPlugin,
  self: SelfPlugin,
  twitter: TwitterPlugin,
}

export const PLUGIN_LIST: Plugin[] = Object.values(PLUGINS)

/** Build the plugin descriptions block injected into the AI system prompt */
export function buildPluginContext(): string {
  return PLUGIN_LIST.map(
    (p) =>
      `- ${p.id} (${p.name}${p.prizeTrack ? ` | Prize: ${p.prizeTrack}` : ''}): ${p.aiDescription}`,
  ).join('\n')
}

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS[id]
}
