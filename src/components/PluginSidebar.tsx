import { useState } from 'react'
import { PLUGIN_LIST } from '../plugins/registry.ts'

interface Props {
  onPrompt: (prompt: string) => void
}

const EXAMPLE_PROMPTS: Record<string, string[]> = {
  metamask: [
    'send 0.5 ETH to vitalik.eth',
    'delegate small transfers under 0.01 ETH to my agent',
  ],
  ens: [
    'lookup the ENS name for my wallet',
    'resolve sushant.eth and show me the address',
  ],
  twitter: [
    'find the best ZK builder on Twitter and send them 0.1 ETH',
    'search for top Solidity developers and list them',
  ],
  self: [
    'verify the identity of vitalik.eth before sending ETH',
    'send 1 ETH only if the recipient has a Self Pass',
  ],
  status: [
    'deploy a simple contract to Status Network gaslessly',
    'send a gasless transaction on Status Network Sepolia',
  ],
}

export default function PluginSidebar({ onPrompt }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="fixed left-0 top-0 h-full w-56 z-30 flex flex-col bg-white border-r border-zinc-200 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 shrink-0">
        <div className="text-xs font-bold text-zinc-900 tracking-widest uppercase">FlowTx</div>
        <div className="text-[10px] text-zinc-400 mt-0.5">visual tx builder</div>
      </div>

      {/* Plugins */}
      <div className="px-3 pt-3 pb-2">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 px-1">Plugins</div>
        <div className="space-y-1">
          {PLUGIN_LIST.map((plugin) => {
            const isOpen = expanded === plugin.id
            const examples = EXAMPLE_PROMPTS[plugin.id] ?? []
            return (
              <div key={plugin.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : plugin.id)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-100 transition-colors text-left group"
                >
                  <span className="text-base shrink-0">{plugin.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-700 group-hover:text-zinc-900 truncate">
                      {plugin.name}
                    </div>
                    {plugin.prizeTrack && (
                      <div className="text-[9px] text-zinc-400 truncate leading-tight">
                        🏆 {plugin.prizeTrack.split('(')[0].trim()}
                      </div>
                    )}
                  </div>
                  <span className={`text-zinc-400 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>

                {isOpen && (
                  <div className="ml-8 mt-1 mb-1 space-y-1.5">
                    <p className="text-[10px] text-zinc-500 leading-snug">{plugin.description}</p>

                    <div className="space-y-1">
                      <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Capabilities</div>
                      {plugin.capabilities.map((cap) => (
                        <div key={cap.action} className="text-[10px] text-zinc-500 flex items-start gap-1">
                          <span className="text-zinc-300 shrink-0">·</span>
                          <span>{cap.label}</span>
                        </div>
                      ))}
                    </div>

                    {examples.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] text-zinc-400 uppercase tracking-wider">Try</div>
                        {examples.map((ex) => (
                          <button
                            key={ex}
                            onClick={() => onPrompt(ex)}
                            className="w-full text-left text-[10px] text-blue-600 hover:text-blue-800 leading-snug py-0.5 transition-colors"
                          >
                            "{ex}"
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-200 mx-3 my-2" />

      {/* Hints */}
      <div className="px-4 pb-4 space-y-2">
        <div className="text-[9px] text-zinc-400 uppercase tracking-wider">How to use</div>
        <div className="space-y-1.5 text-[10px] text-zinc-500">
          <div className="flex items-start gap-1.5">
            <span className="text-zinc-400 shrink-0 mt-0.5">F</span>
            <span>draw a frame on canvas to place a flow</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-zinc-400 shrink-0 mt-0.5">⌨</span>
            <span>double-click empty canvas for quick prompt</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-zinc-400 shrink-0 mt-0.5">⚡</span>
            <span>select a flow frame → Execute</span>
          </div>
        </div>
      </div>
    </div>
  )
}
