import type { Plugin, ExecutionContext, PluginResult } from './types.ts'

export const UtilPlugin: Plugin = {
  id: 'util',
  name: 'Utilities',
  description: 'Combine arrays, separate items, join or split strings',
  aiDescription:
    'Utility/transform nodes. ' +
    'merge(a[]*, b[]*) → merged[] — combine two string arrays into one. ' +
    'first(items[]*) → first, rest[] — extract the first element from an array. ' +
    'collect(text*) → items[], count — parse a comma/newline-separated string into an array. ' +
    'join(items[]*, separator?) → text — join an array into a single string. ' +
    'Use merge when two upstream nodes each output an array and you need them combined before passing downstream. ' +
    'Use first when you need a single string from an array. ' +
    'Use collect when a param contains comma-separated values and you need a real array. ' +
    'Use join when chatgpt or output needs a single string from an array.',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/><path d="M16 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  color: 'grey',
  capabilities: [
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
      description: 'Parse a comma or newline-separated string into an array',
      inputs: [
        { key: 'text', label: 'Text', type: 'string', required: true, placeholder: 'alice.eth, bob.eth, carol.eth' },
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
