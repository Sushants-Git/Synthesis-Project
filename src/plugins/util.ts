import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const UtilPlugin: Plugin = {
  id: 'util',
  name: 'Utilities',
  description: 'Filter, combine, split, and transform arrays and strings',
  aiDescription:
    'Utility/transform nodes. ' +
    'filter(items[]*, conditions[]*) → kept[], rejected[], kept_count — keep items where the matching condition string is "true". ' +
    'CRITICAL: Use filter when GPT returns a true/false array and you need to act on only the matching items. ' +
    'Wire: chatgpt:results → filter:conditions, source_handles → filter:items. ' +
    'merge(a[]*, b[]*) → merged[], count — combine two arrays. ' +
    'first(items[]*) → first, rest[] — extract first element as string. ' +
    'collect(text*) → items[], count — parse comma/newline string into array. Only use when input is a string. NEVER wire a string[] into collect. ' +
    'join(items[]*, separator?) → text — join array to single string.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/><path d="M16 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  color: 'grey',
  capabilities: [
    {
      action: 'filter',
      label: 'Filter by Condition',
      description: 'Keep items where the parallel condition string is "true"',
      inputs: [
        { key: 'items', label: 'Items to filter', type: 'string[]', required: true },
        { key: 'conditions', label: 'Conditions (true/false per item)', type: 'string[]', required: true },
      ],
      outputs: [
        { key: 'kept', label: 'Kept Items', type: 'string[]' },
        { key: 'rejected', label: 'Rejected Items', type: 'string[]' },
        { key: 'kept_count', label: 'Kept Count', type: 'string' },
      ],
    },
    {
      action: 'merge',
      label: 'Merge Arrays',
      description: 'Combine two string arrays into one',
      inputs: [
        { key: 'a', label: 'Array A', type: 'string[]', required: true },
        { key: 'b', label: 'Array B', type: 'string[]', required: true },
      ],
      outputs: [
        { key: 'merged', label: 'Merged Array', type: 'string[]' },
        { key: 'count', label: 'Total Count', type: 'string' },
      ],
    },
    {
      action: 'first',
      label: 'Extract First',
      description: 'Pull the first item out of an array as a string',
      inputs: [
        { key: 'items', label: 'Array', type: 'string[]', required: true },
      ],
      outputs: [
        { key: 'first', label: 'First Item', type: 'string' },
        { key: 'rest', label: 'Remaining Items', type: 'string[]' },
      ],
    },
    {
      action: 'collect',
      label: 'Make Array',
      description: 'Parse a comma or newline-separated STRING into an array. Input must be a string, not an array.',
      inputs: [
        { key: 'text', label: 'Comma-separated text', type: 'string', required: true, placeholder: 'alice.eth, bob.eth' },
      ],
      outputs: [
        { key: 'items', label: 'Items Array', type: 'string[]' },
        { key: 'count', label: 'Count', type: 'string' },
      ],
    },
    {
      action: 'join',
      label: 'Join to Text',
      description: 'Join an array into a single string',
      inputs: [
        { key: 'items', label: 'Array', type: 'string[]', required: true },
        { key: 'separator', label: 'Separator', type: 'string', required: false, placeholder: ', ' },
      ],
      outputs: [
        { key: 'text', label: 'Joined Text', type: 'string' },
      ],
    },
  ],

  async execute(action, inputs, _ctx: ExecutionContext): Promise<PluginResult> {
    switch (action) {
      case 'filter': {
        const items = (inputs.items as string[]) ?? []
        const conditions = (inputs.conditions as string[]) ?? []
        if (!items.length) return { status: 'error', error: 'Items array is empty' }

        const kept: string[] = []
        const rejected: string[] = []
        items.forEach((item, i) => {
          const cond = (conditions[i] ?? '').toLowerCase().trim()
          const passes = cond === 'true' || cond === '1' || cond === 'yes'
          ;(passes ? kept : rejected).push(item)
        })

        return {
          status: 'done',
          outputs: { kept, rejected, kept_count: String(kept.length) },
          display: `Kept ${kept.length} / ${items.length} items`,
        }
      }

      case 'merge': {
        const a = (inputs.a as string[]) ?? []
        const b = (inputs.b as string[]) ?? []
        const merged = [...a, ...b]
        return {
          status: 'done',
          outputs: { merged, count: String(merged.length) },
          display: `Merged ${a.length} + ${b.length} = ${merged.length} items`,
        }
      }

      case 'first': {
        const items = inputs.items as string[]
        if (!items?.length) return { status: 'error', error: 'Array is empty' }
        const [first, ...rest] = items
        return {
          status: 'done',
          outputs: { first: first!, rest },
          display: `First: ${first}`,
        }
      }

      case 'collect': {
        const text = inputs.text as string
        if (!text?.trim()) return { status: 'error', error: 'Text required' }
        const items = text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
        return {
          status: 'done',
          outputs: { items, count: String(items.length) },
          display: `${items.length} items`,
        }
      }

      case 'join': {
        const items = (inputs.items as string[]) ?? []
        const sep = (inputs.separator as string | undefined) ?? ', '
        const text = items.join(sep)
        return {
          status: 'done',
          outputs: { text },
          display: text.length > 60 ? text.slice(0, 57) + '…' : text,
        }
      }

      default:
        return { status: 'error', error: `Unknown action: ${action}` }
    }
  },
}
