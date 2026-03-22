import { useState } from 'react'
import PluginIcon from './PluginIcon.tsx'
import {
  getPluginList,
  registerSoftPlugin,
  removeSoftPluginById,
  loadSoftPluginDefs,
  type Plugin,
  type SoftPluginDef,
} from '../plugins/registry.ts'
import PluginBuilder from './PluginBuilder.tsx'

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

function ChevronRight({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms cubic-bezier(0.215,0.61,0.355,1)', flexShrink: 0 }}
    >
      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PluginRow({
  plugin, isOpen, isSoft, onToggle, onPrompt, onAddBlock, onEdit, onRemove,
}: {
  plugin: Plugin; isOpen: boolean; isSoft: boolean
  onToggle: () => void; onPrompt: (p: string) => void
  onAddBlock: (pid: string, action: string) => void
  onEdit: () => void; onRemove: () => void
}) {
  const examples = EXAMPLE_PROMPTS[plugin.id] ?? []

  return (
    <div className="rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors duration-100 group ${
          isOpen ? 'bg-zinc-100' : 'hover:bg-zinc-50'
        }`}
      >
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors duration-100 ${
          isOpen ? 'bg-white shadow-sm' : 'bg-zinc-100 group-hover:bg-white group-hover:shadow-sm'
        }`}>
          <PluginIcon icon={plugin.icon} size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-700 group-hover:text-zinc-900 truncate transition-colors duration-100">
              {plugin.name}
            </span>
            {isSoft && (
              <span className="text-[8px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 leading-4 shrink-0 font-medium">
                mine
              </span>
            )}
          </div>
          {plugin.prizeTrack && (
            <div className="text-[9px] text-zinc-400 truncate leading-tight mt-0.5">
              {plugin.prizeTrack.split('(')[0].trim()}
            </div>
          )}
        </div>
        <span className="text-zinc-300 group-hover:text-zinc-400 transition-colors duration-100">
          <ChevronRight open={isOpen} />
        </span>
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        transition: 'grid-template-rows 200ms cubic-bezier(0.215,0.61,0.355,1)',
      }}>
        <div className="overflow-hidden">
          <div className="px-2.5 pb-2.5 pt-1 bg-zinc-50 border-t border-zinc-100 space-y-2.5">
            <p className="text-[10px] text-zinc-500 leading-relaxed">{plugin.description}</p>

            <div className="space-y-0.5">
              <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold mb-1">Actions</div>
              {plugin.capabilities.map((cap) => (
                <button
                  key={cap.action}
                  onClick={() => onAddBlock(plugin.id, cap.action)}
                  title="Add to canvas"
                  className="w-full flex items-center gap-2 py-1 px-2 text-left rounded-md hover:bg-white hover:shadow-sm transition-[background-color,box-shadow] duration-100 active:scale-[0.97] group/cap"
                >
                  <span className="w-1 h-1 rounded-full bg-zinc-300 group-hover/cap:bg-blue-400 shrink-0 transition-colors duration-100" />
                  <span className="text-[10px] text-zinc-500 group-hover/cap:text-zinc-800 flex-1 transition-colors duration-100">
                    {cap.label}
                  </span>
                  <span className="text-[9px] text-zinc-300 group-hover/cap:text-blue-500 shrink-0 font-medium transition-colors duration-100">
                    + add
                  </span>
                </button>
              ))}
            </div>

            {examples.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold mb-1">Try asking</div>
                {examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => onPrompt(ex)}
                    className="w-full text-left text-[10px] text-blue-500 hover:text-blue-700 leading-relaxed py-0.5 px-2 rounded hover:bg-blue-50 transition-[background-color,color] duration-100 active:scale-[0.97]"
                  >
                    "{ex}"
                  </button>
                ))}
              </div>
            )}

            {isSoft && (
              <div className="flex items-center gap-3 pt-0.5 px-1">
                <button onClick={onEdit} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors duration-100">
                  Edit
                </button>
                <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-600 transition-colors duration-100">
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PluginSidebar({ onPrompt, onAddBlock }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingSoftDef, setEditingSoftDef] = useState<SoftPluginDef | null>(null)
  const [pluginVersion, setPluginVersion] = useState(0)

  const plugins = getPluginList()
  const softDefs = loadSoftPluginDefs()
  const softDefMap = new Map(softDefs.map((d) => [d.id, d]))

  const hardPlugins = plugins.filter((p) => p.category === 'hard')
  const softPlugins = plugins.filter((p) => p.category === 'soft')

  const handleSaveSoftPlugin = (def: SoftPluginDef) => {
    registerSoftPlugin(def)
    setPluginVersion((v) => v + 1)
    setShowBuilder(false)
    setEditingSoftDef(null)
    setExpanded(def.id)
  }

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id))

  return (
    <>
      <div
        className="fixed left-0 top-0 h-full w-56 z-30 flex flex-col bg-white border-r border-zinc-100 overflow-y-auto"
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onCopy={(e) => e.stopPropagation()}
        onCut={(e) => e.stopPropagation()}
        onPaste={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-4 shrink-0">
          <div>
            <div className="text-[11px] font-bold text-zinc-900 tracking-widest uppercase leading-none">
              canvii
            </div>
            <div className="text-[9px] text-zinc-400 mt-0.5 leading-none">visual flow builder</div>
          </div>
        </div>

        <div className="h-px bg-zinc-100 mx-4 shrink-0" />

        {/* Plugin sections */}
        <div className="px-3 pt-4 pb-2 flex-1">
          <span className="hidden">{pluginVersion}</span>

          {/* Core plugins */}
          <div className="mb-4">
            <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold mb-2 px-1">
              Core Plugins
            </div>
            <div className="space-y-0.5">
              {hardPlugins.map((plugin) => (
                <PluginRow
                  key={plugin.id}
                  plugin={plugin}
                  isOpen={expanded === plugin.id}
                  isSoft={false}
                  onToggle={() => toggle(plugin.id)}
                  onPrompt={onPrompt}
                  onAddBlock={onAddBlock}
                  onEdit={() => {}}
                  onRemove={() => {}}
                />
              ))}
            </div>
          </div>

          {/* User plugins */}
          {softPlugins.length > 0 && (
            <div className="mb-4">
              <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold mb-2 px-1">
                My Plugins
              </div>
              <div className="space-y-0.5">
                {softPlugins.map((plugin) => (
                  <PluginRow
                    key={plugin.id}
                    plugin={plugin}
                    isOpen={expanded === plugin.id}
                    isSoft={true}
                    onToggle={() => toggle(plugin.id)}
                    onPrompt={onPrompt}
                    onAddBlock={onAddBlock}
                    onEdit={() => {
                      const def = softDefMap.get(plugin.id)
                      if (def) { setEditingSoftDef(def); setShowBuilder(true) }
                    }}
                    onRemove={() => {
                      removeSoftPluginById(plugin.id)
                      setPluginVersion((v) => v + 1)
                      if (expanded === plugin.id) setExpanded(null)
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Build plugin button */}
        <div className="px-3 pb-3">
          <button
            onClick={() => { setEditingSoftDef(null); setShowBuilder(true) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] transition-[background-color,transform] duration-150 group"
          >
            <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center shrink-0">
              <span className="text-xs leading-none">🧩</span>
            </div>
            <span className="text-[11px] font-semibold text-white flex-1 text-left">Build Plugin</span>
            <span className="text-zinc-500 text-[10px] group-hover:text-zinc-400 transition-colors duration-100">API →</span>
          </button>
        </div>

        {/* How to use */}
        <div className="px-4 pb-5">
          <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold mb-2">How to use</div>
          <div className="space-y-1.5">
            {[
              { key: 'F', hint: 'draw a frame, describe a flow' },
              { key: '2×', hint: 'double-click for quick prompt' },
              { key: '+', hint: 'click action to add block' },
              { key: '⚡', hint: 'Execute to run the flow' },
            ].map(({ key, hint }) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="min-w-[22px] px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[9px] text-zinc-500 font-mono text-center shrink-0">
                  {key}
                </kbd>
                <span className="text-[10px] text-zinc-400">{hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showBuilder && (
        <PluginBuilder
          initial={editingSoftDef ?? undefined}
          onSave={handleSaveSoftPlugin}
          onClose={() => { setShowBuilder(false); setEditingSoftDef(null) }}
        />
      )}
    </>
  )
}
