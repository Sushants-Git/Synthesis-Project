import { useState } from 'react'
import { getPluginList, registerPluginFromManifest, removeCustomPlugin, loadSavedManifests, type PluginManifest } from '../plugins/registry.ts'
import AddPluginModal from './AddPluginModal.tsx'

interface Props {
  onPrompt: (prompt: string) => void
  onAddBlock: (pluginId: string, action: string) => void
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

export default function PluginSidebar({ onPrompt, onAddBlock }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  // Increment to force re-render after registration/removal
  const [pluginVersion, setPluginVersion] = useState(0)

  const plugins = getPluginList()
  const customIds = new Set(loadSavedManifests().map((m) => m.id))

  const handleAdd = (manifest: PluginManifest) => {
    registerPluginFromManifest(manifest)
    setPluginVersion((v) => v + 1)
    setShowAddModal(false)
    setExpanded(manifest.id) // auto-expand the new plugin
  }

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removeCustomPlugin(id)
    setPluginVersion((v) => v + 1)
    if (expanded === id) setExpanded(null)
  }

  return (
    <>
      <div className="fixed left-0 top-0 h-full w-56 z-30 flex flex-col bg-white border-r border-zinc-200 overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-4 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-black leading-none">F</span>
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-900 tracking-widest uppercase leading-none">FlowTx</div>
              <div className="text-[9px] text-zinc-400 mt-0.5 leading-none">visual tx builder</div>
            </div>
          </div>
        </div>

        {/* Plugins */}
        <div className="px-3 pt-3 pb-2 flex-1">
          <div className="text-[9px] text-zinc-400 uppercase tracking-widest mb-2 px-1 font-medium">
            Plugins
            {/* Invisible dep so React re-renders when pluginVersion changes */}
            <span className="hidden">{pluginVersion}</span>
          </div>
          <div className="space-y-0.5">
            {plugins.map((plugin) => {
              const isOpen = expanded === plugin.id
              const examples = EXAMPLE_PROMPTS[plugin.id] ?? []
              const isCustom = customIds.has(plugin.id)
              return (
                <div key={plugin.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : plugin.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-100 transition-[background-color] duration-150 text-left group active:scale-[0.98]"
                  >
                    <span className="text-base shrink-0 leading-none">{plugin.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <div className="text-xs font-medium text-zinc-700 group-hover:text-zinc-900 truncate transition-colors duration-150">
                          {plugin.name}
                        </div>
                        {isCustom && (
                          <span className="text-[8px] text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-1 leading-4 shrink-0">custom</span>
                        )}
                      </div>
                      {plugin.prizeTrack && (
                        <div className="text-[9px] text-zinc-400 truncate leading-tight">
                          🏆 {plugin.prizeTrack.split('(')[0].trim()}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-zinc-400 text-xs shrink-0 transition-transform duration-200"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ›
                    </span>
                  </button>

                  {/* Smooth accordion */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: 'grid-template-rows 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
                    }}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-8 mt-1 mb-2 space-y-1.5 pb-0.5">
                        <p className="text-[10px] text-zinc-500 leading-snug">{plugin.description}</p>

                        <div className="space-y-1">
                          <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium">Capabilities</div>
                          {plugin.capabilities.map((cap) => (
                            <button
                              key={cap.action}
                              onClick={() => onAddBlock(plugin.id, cap.action)}
                              title="Add block to canvas"
                              className="w-full flex items-start gap-1.5 py-0.5 text-left group/cap rounded hover:bg-zinc-50 transition-colors duration-100 active:scale-[0.97]"
                            >
                              <span className="text-zinc-300 shrink-0 mt-[1px] group-hover/cap:text-zinc-400 transition-colors">·</span>
                              <span className="text-[10px] text-zinc-500 group-hover/cap:text-zinc-700 flex-1 transition-colors">{cap.label}</span>
                              <span className="text-[9px] text-zinc-300 group-hover/cap:text-blue-400 shrink-0 transition-colors pr-1">+</span>
                            </button>
                          ))}
                        </div>

                        {examples.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium">Try</div>
                            {examples.map((ex) => (
                              <button
                                key={ex}
                                onClick={() => onPrompt(ex)}
                                className="w-full text-left text-[10px] text-blue-600 hover:text-blue-800 leading-snug py-0.5 transition-colors duration-100 active:scale-[0.97]"
                              >
                                "{ex}"
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Remove custom plugin */}
                        {isCustom && (
                          <button
                            onClick={(e) => handleRemove(plugin.id, e)}
                            className="text-[9px] text-red-400 hover:text-red-600 transition-colors duration-100 mt-0.5"
                          >
                            Remove plugin
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-100 mx-3 my-2" />

        {/* Add Plugin button */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-zinc-300 hover:border-blue-400 hover:bg-blue-50/60 rounded-lg py-2 text-[10px] text-zinc-400 hover:text-blue-600 transition-[color,border-color,background-color] duration-150 active:scale-[0.98]"
          >
            <span className="text-sm leading-none">+</span>
            <span>Add Plugin</span>
          </button>
        </div>

        {/* Hints */}
        <div className="px-4 pb-4 space-y-2">
          <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-medium">How to use</div>
          <div className="space-y-2 text-[10px] text-zinc-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] text-zinc-500 font-mono shrink-0">F</kbd>
              <span>draw a frame, describe a flow</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] text-zinc-500 font-mono shrink-0">2×</kbd>
              <span>double-click canvas for quick prompt</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] text-zinc-500 font-mono shrink-0">+</kbd>
              <span>click capability to add block</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] text-zinc-500 font-mono shrink-0">⚡</kbd>
              <span>Execute to run the flow</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add Plugin Modal */}
      {showAddModal && (
        <AddPluginModal
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}
